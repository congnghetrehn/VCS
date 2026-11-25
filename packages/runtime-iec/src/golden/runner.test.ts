// Test golden runner — M1 §12.1, P1.7 (STATE §22 bảng E, OQ-199/200/201).
// Program dựng tay bằng ir-testkit (runtime-iec không import vendor-siemens).

import { describe, expect, it } from 'vitest';
import type { IrProgram } from '../ir.js';
import {
  abs,
  assign,
  bin,
  dbField,
  dbFromDecls,
  load,
  num,
  obBlock,
  prog,
} from '../ir-testkit.js';
import { GoldenError, parseGoldenYaml, runGolden } from './runner.js';
import type { GoldenCase } from './schema.js';

/** OB1 copy %I0.0 → %Q0.0; đếm %MW0 := %MW0 + 1 mỗi scan. */
function copyProg(): IrProgram {
  return prog(
    [
      obBlock('Main', 1, [
        assign(abs('Q', 0, 'Bool', 0), load(abs('I', 0, 'Bool', 0), 'Bool')),
        assign(
          abs('M', 0, 'Int'),
          bin('add', load(abs('M', 0, 'Int'), 'Int'), num(1), 'Int'),
        ),
      ]),
    ],
    [],
    [{ ob: 1, block: 'Main' }],
  );
}

/** OB1 chia 0 khi %MW2 = 0: %MW0 := 10 / %MW2 (Int). */
function divProg(): IrProgram {
  return prog(
    [
      obBlock('Main', 1, [
        assign(
          abs('M', 0, 'Int'),
          bin('div', num(10), load(abs('M', 2, 'Int'), 'Int'), 'Int'),
        ),
      ]),
    ],
    [],
    [{ ob: 1, block: 'Main' }],
  );
}

/** OB1 gán Real 0.1 vào field X của DB_R (đọc Real phải qua field DB
 * có kiểu — ref tuyệt đối %MD0 mặc định DInt theo độ rộng, xem tagmap). */
function realProg(): IrProgram {
  const db = dbFromDecls('DB_R', [{ name: 'X', type: 'Real' }]);
  return prog(
    [
      obBlock('Main', 1, [
        assign(dbField('DB_R', ['X']), { op: 'const', type: 'Real', value: 0.1 }),
      ]),
    ],
    [db],
    [{ ob: 1, block: 'Main' }],
  );
}

const TON_YAML = `id: ton_basic_3s
description: TON 3s, IN lên tại t=200, Q lên tại t=3200
config: { scanPeriodMs: 100 }
sources:
  - file: main.scl
    text: |
      ORGANIZATION_BLOCK "Main"
      BEGIN
        "T1"(IN := %M0.0, PT := T#3s);
        %M1.0 := "T1".Q;
      END_ORGANIZATION_BLOCK
  - file: db.scl
    text: |
      DATA_BLOCK "T1" TON END_DATA_BLOCK
organization: [{ ob: 1 }]
steps:
  - { t: 0,    set: { "%M0.0": false },  expect: { "%M1.0": false } }
  - { t: 200,  set: { "%M0.0": true  },  expect: { "%M1.0": false, "\\"T1\\".ET": 0 } }
  - { t: 300,                            expect: { "\\"T1\\".ET": 100 } }
`;

describe('parseGoldenYaml', () => {
  it('parse ví dụ §12.1 (expectedFrom mặc định spec)', () => {
    const c = parseGoldenYaml(TON_YAML, 'ton_basic_3s.golden.yaml');
    expect(c.id).toBe('ton_basic_3s');
    expect(c.expectedFrom).toBeUndefined();
    expect(c.config?.scanPeriodMs).toBe(100);
    expect(c.sources).toHaveLength(2);
    expect(c.steps).toHaveLength(3);
    expect(c.steps[1]?.set).toEqual({ '%M0.0': true });
  });

  it('expectedFrom plcsim được giữ', () => {
    const c = parseGoldenYaml('id: x\nsources:\n  - { file: a.scl, text: "x" }\nsteps:\n  - { t: 0 }\nexpectedFrom: plcsim\n');
    expect(c.expectedFrom).toBe('plcsim');
  });

  it('YAML không parse được → GoldenError', () => {
    expect(() => parseGoldenYaml('id: [không đóng', 'bad.yaml')).toThrow(GoldenError);
  });

  it('thiếu steps → GoldenError (nêu file + field)', () => {
    expect(() =>
      parseGoldenYaml('id: x\nsources:\n  - { file: a.scl, text: "x" }\n', 'no-steps.yaml'),
    ).toThrow(/no-steps\.yaml.*steps/);
  });

  it('steps giảm dần theo t → GoldenError', () => {
    expect(() =>
      parseGoldenYaml(
        'id: x\nsources:\n  - { file: a.scl, text: "x" }\nsteps:\n  - { t: 100 }\n  - { t: 50 }\n',
      ),
    ).toThrow(/tăng dần/);
  });

  it('t âm → GoldenError', () => {
    expect(() =>
      parseGoldenYaml(
        'id: x\nsources:\n  - { file: a.scl, text: "x" }\nsteps:\n  - { t: -10 }\n',
      ),
    ).toThrow(GoldenError);
  });
});

describe('runGolden — copy/counter', () => {
  it('step đầu không scan; các step sau mỗi step 1 scan; scans đếm đúng', () => {
    const r = runGolden(
      {
        id: 'copy',
        sources: [{ file: 'a.scl', text: 'x' }],
        steps: [
          { t: 0, set: { '%I0.0': false }, expect: { '%Q0.0': false, '%MW0': 0 } },
          { t: 10, set: { '%I0.0': true }, expect: { '%Q0.0': true, '%MW0': 1 } },
          { t: 20, set: { '%I0.0': false }, expect: { '%Q0.0': false, '%MW0': 2 } },
        ],
      },
      copyProg(),
    );
    expect(r).toEqual({ id: 'copy', steps: 3, scans: 2 });
  });

  it('step đầu set nhưng chưa scan: expect đọc giá trị vừa set, Q vẫn cũ', () => {
    const r = runGolden(
      {
        id: 'first-no-scan',
        sources: [{ file: 'a.scl', text: 'x' }],
        steps: [
          { t: 0, set: { '%I0.0': true }, expect: { '%Q0.0': false } },
          { t: 10, expect: { '%Q0.0': true } },
        ],
      },
      copyProg(),
    );
    expect(r.scans).toBe(1);
  });

  it('gap = 2×period chạy 2 scan trong 1 step', () => {
    const r = runGolden(
      {
        id: 'gap2',
        sources: [{ file: 'a.scl', text: 'x' }],
        steps: [{ t: 0, expect: { '%MW0': 0 } }, { t: 20, expect: { '%MW0': 2 } }],
      },
      copyProg(),
    );
    expect(r.scans).toBe(2);
  });

  it('gap không chia hết cho scanPeriodMs → GoldenError (OQ-199)', () => {
    expect(() =>
      runGolden(
        {
          id: 'bad-gap',
          sources: [{ file: 'a.scl', text: 'x' }],
          steps: [{ t: 0 }, { t: 15, expect: { '%MW0': 1 } }],
        },
        copyProg(),
      ),
    ).toThrow(/không chia hết cho scanPeriodMs 10/);
  });

  it('expect sai → GoldenError nêu id, step, ref, mong đợi vs thực tế', () => {
    expect(() =>
      runGolden(
        {
          id: 'wrong-expect',
          sources: [{ file: 'a.scl', text: 'x' }],
          steps: [{ t: 0 }, { t: 10, expect: { '%MW0': 99 } }],
        },
        copyProg(),
      ),
    ).toThrow(/wrong-expect step 1 \(t=10\): %MW0 mong đợi 99 nhưng thực tế 1/);
  });

  it('expect ref không tồn tại → GoldenError', () => {
    expect(() =>
      runGolden(
        {
          id: 'bad-ref',
          sources: [{ file: 'a.scl', text: 'x' }],
          steps: [{ t: 0, expect: { '"NOPE".X': true } }],
        },
        copyProg(),
      ),
    ).toThrow(/bad-ref step 0.*đọc "NOPE"\.X thất bại/);
  });

  it('set sai kiểu → GoldenError (TAG-E001 bọc lại)', () => {
    expect(() =>
      runGolden(
        {
          id: 'bad-set',
          sources: [{ file: 'a.scl', text: 'x' }],
          steps: [{ t: 0, set: { '%MW0': 'chuỗi' } }],
        },
        copyProg(),
      ),
    ).toThrow(/bad-set step 0.*set %MW0 thất bại/);
  });

  it('config.scanPeriodMs riêng: gap 100 chạy 1 scan, gap 50 lỗi', () => {
    const golden: GoldenCase = {
      id: 'period100',
      config: { scanPeriodMs: 100 },
      sources: [{ file: 'a.scl', text: 'x' }],
      steps: [{ t: 0, expect: { '%MW0': 0 } }, { t: 100, expect: { '%MW0': 1 } }],
    };
    expect(runGolden(golden, copyProg()).scans).toBe(1);
    expect(() =>
      runGolden(
        { ...golden, id: 'period100-bad', steps: [{ t: 0 }, { t: 50 }] },
        copyProg(),
      ),
    ).toThrow(/không chia hết cho scanPeriodMs 100/);
  });

  it('organization override: ob không có trong program → GoldenError', () => {
    expect(() =>
      runGolden(
        {
          id: 'bad-ob',
          organization: [{ ob: 35 }],
          sources: [{ file: 'a.scl', text: 'x' }],
          steps: [{ t: 0 }],
        },
        copyProg(),
      ),
    ).toThrow(/organization ob 35 không có trong chương trình/);
  });
});

describe('runGolden — Real/faults/force/snapshot', () => {
  it('Real: số không nguyên so bằng fround; approx với eps', () => {
    const base: GoldenCase = {
      id: 'real',
      sources: [{ file: 'a.scl', text: 'x' }],
      steps: [{ t: 0 }, { t: 10, expect: { '"DB_R".X': 0.1 } }],
    };
    expect(runGolden(base, realProg()).scans).toBe(1);
    const approx: GoldenCase = {
      ...base,
      id: 'real-approx',
      steps: [{ t: 0 }, { t: 10, expect: { '"DB_R".X': { approx: 0.100001, eps: 0.001 } } }],
    };
    expect(runGolden(approx, realProg()).scans).toBe(1);
  });

  it('Real sai → GoldenError', () => {
    expect(() =>
      runGolden(
        {
          id: 'real-bad',
          sources: [{ file: 'a.scl', text: 'x' }],
          steps: [{ t: 0 }, { t: 10, expect: { '"DB_R".X': 0.2 } }],
        },
        realProg(),
      ),
    ).toThrow(/"DB_R"\.X mong đợi 0\.2 nhưng thực tế/);
  });

  it('faults: DIV_ZERO trong step được liệt kê → pass; không liệt kê → GoldenError', () => {
    const golden: GoldenCase = {
      id: 'div-zero',
      sources: [{ file: 'a.scl', text: 'x' }],
      steps: [
        { t: 0, set: { '%MW2': 0 }, expect: { '%MW0': 0 }, faults: [] },
        { t: 10, expect: { '%MW0': 0 }, faults: ['DIV_ZERO'] },
        { t: 20, set: { '%MW2': 2 }, expect: { '%MW0': 5 } },
      ],
    };
    expect(runGolden(golden, divProg()).scans).toBe(2);
    const silent: GoldenCase = {
      ...golden,
      id: 'div-zero-silent',
      steps: [
        { t: 0, set: { '%MW2': 0 } },
        { t: 10, expect: { '%MW0': 0 } },
      ],
    };
    expect(() => runGolden(silent, divProg())).toThrow(
      /faults mong đợi \[\] nhưng thực tế \[DIV_ZERO\]/,
    );
  });

  it('faults sai mã → GoldenError', () => {
    expect(() =>
      runGolden(
        {
          id: 'fault-wrong-code',
          sources: [{ file: 'a.scl', text: 'x' }],
          steps: [{ t: 0, set: { '%MW2': 0 } }, { t: 10, faults: ['SCAN_OVERRUN'] }],
        },
        divProg(),
      ),
    ).toThrow(/faults mong đợi \[SCAN_OVERRUN\] nhưng thực tế \[DIV_ZERO\]/);
  });

  it('force thắng set/scan; unforce trả lại giá trị thật', () => {
    const r = runGolden(
      {
        id: 'force',
        sources: [{ file: 'a.scl', text: 'x' }],
        steps: [
          { t: 0, set: { '%I0.0': true }, force: { '%Q0.0': false }, expect: { '%Q0.0': false } },
          { t: 10, expect: { '%Q0.0': false } },
          { t: 20, unforce: ['%Q0.0'], expect: { '%Q0.0': true } },
        ],
      },
      copyProg(),
    );
    expect(r.scans).toBe(2);
  });

  it('snapshot/restore: đếm về đúng giá trị lúc snapshot (restore ở step cùng t, gap 0, để không scan thêm)', () => {
    const r = runGolden(
      {
        id: 'snap',
        sources: [{ file: 'a.scl', text: 'x' }],
        steps: [
          { t: 0, expect: { '%MW0': 0 } },
          { t: 10, expect: { '%MW0': 1 } },
          { t: 20, expect: { '%MW0': 2 }, snapshot: true },
          { t: 30, expect: { '%MW0': 3 } },
          { t: 30, restore: true, expect: { '%MW0': 2 } },
          { t: 40, expect: { '%MW0': 3 } },
        ],
      },
      copyProg(),
    );
    // scans = 3: scanCount cũng nằm trong snapshot nên restore tua nó về 2,
    // scan ở t=40 đưa lên 3 (các scan tại t=10, 20, 30).
    expect(r.scans).toBe(3);
  });

  it('restore khi chưa snapshot → GoldenError', () => {
    expect(() =>
      runGolden(
        {
          id: 'restore-nosnap',
          sources: [{ file: 'a.scl', text: 'x' }],
          steps: [{ t: 0, restore: true }],
        },
        copyProg(),
      ),
    ).toThrow(/restore nhưng chưa có snapshot/);
  });
});
