// EventLog (M2 §5.3).

import { describe, expect, it } from 'vitest';

import { EventLog, EVENT_LOG_MAX } from './events.js';

describe('EventLog', () => {
  it('push/entries/length', () => {
    const log = new EventLog();
    expect(log.length).toBe(0);
    log.push({ t: 0, type: 'state', equipment: 'E1', key: 'running', from: false, to: true });
    expect(log.length).toBe(1);
    expect(log.entries()[0]?.to).toBe(true);
  });

  it('vòng tròn 100000: mục cũ nhất bị đẩy ra', () => {
    const log = new EventLog();
    for (let i = 0; i < EVENT_LOG_MAX + 1; i++) log.push({ t: i, type: 'info', msg: 'm' + String(i) });
    expect(log.length).toBe(EVENT_LOG_MAX);
    expect(log.entries()[0]?.t).toBe(1);
    expect(log.entries()[EVENT_LOG_MAX - 1]?.t).toBe(EVENT_LOG_MAX);
  });

  it('clear làm rỗng', () => {
    const log = new EventLog();
    log.push({ t: 0, type: 'info' });
    log.clear();
    expect(log.length).toBe(0);
    expect(log.entries()).toEqual([]);
  });

  it('entries/toJSON trả bản sao (sửa ngoài không ảnh hưởng log)', () => {
    const log = new EventLog();
    log.push({ t: 0, type: 'info' });
    const a = log.entries();
    a.pop();
    expect(log.length).toBe(1);
    expect(log.toJSON()).toHaveLength(1);
  });
});
