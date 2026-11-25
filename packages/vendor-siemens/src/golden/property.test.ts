// Property test §12.3 — @vcs/vendor-siemens (M1 §12.3, P1.7).
// Hai tính chất bất biến, fast-check seed cố định (tái lập được):
//  (1) TON: Q ⟺ IN liên tục true đủ PT (mô hình tham chiếu độc lập).
//  (2) CTUD: CV luôn trong [-32768..32767], QU ⟺ CV>=PV, QD ⟺ CV<=0.
// expectedFrom: spec
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildTagAddressMap, SoftPlc } from '@vcs/runtime-iec';
import { compileProject } from '../scl/compile-project.js';

const PERIOD_MS = 10;

const TON_FILES = [
  {
    path: 'db.scl',
    text: 'DATA_BLOCK "T1" "TON"\nBEGIN\nEND_DATA_BLOCK\n',
  },
  {
    path: 'main.scl',
    text: [
      'ORGANIZATION_BLOCK "Main"',
      'BEGIN',
      '  "T1"(IN := %M0.0, PT := T#100ms);',
      '  %M1.0 := "T1".Q;',
      'END_ORGANIZATION_BLOCK',
      '',
    ].join('\n'),
  },
];

const CTUD_FILES = [
  {
    path: 'db.scl',
    text: 'DATA_BLOCK "C1" "CTUD"\nBEGIN\nEND_DATA_BLOCK\n',
  },
  {
    path: 'main.scl',
    text: [
      'ORGANIZATION_BLOCK "Main"',
      'BEGIN',
      '  "C1"(CU := %M0.0, CD := %M0.1, R := %M0.2, LD := %M0.3, PV := 5);',
      '  %MW10 := "C1".CV;',
      '  %Q0.0 := "C1".QU;',
      '  %Q0.1 := "C1".QD;',
      'END_ORGANIZATION_BLOCK',
      '',
    ].join('\n'),
  },
];

function compileOrThrow(files: { path: string; text: string }[]) {
  const { program, diagnostics } = compileProject(files, { tags: [] });
  expect(diagnostics).toEqual([]);
  return program;
}

describe('property §12.3 — TON (seed cố định)', () => {
  it('Q và ET khớp mô hình tham chiếu trên chuỗi IN ngẫu nhiên', () => {
    const program = compileOrThrow(TON_FILES);
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 5, maxLength: 30 }),
        (ins) => {
          const plc = new SoftPlc(program, buildTagAddressMap([]), {
            id: 'prop-ton',
            scanPeriodMs: PERIOD_MS,
          });
          plc.start();
          // Mô hình tham chiếu: ET = (số scan true liên tiếp - 1) * chu kỳ,
          // kẹp tại PT=100; Q ⟺ ET >= 100.
          let run = 0;
          let prevT = 0;
          for (const inVal of ins) {
            plc.write('%M0.0', inVal);
            plc.step(prevT, PERIOD_MS);
            prevT += PERIOD_MS;
            run = inVal ? run + 1 : 0;
            const expectedEt = Math.min((run - 1) * PERIOD_MS, 100);
            const expectedQ = run >= 1 && expectedEt >= 100;
            expect(plc.read('"T1".ET')).toBe(run === 0 ? 0 : expectedEt);
            expect(plc.read('%M1.0')).toBe(expectedQ);
          }
        },
      ),
      { seed: 20261125, numRuns: 50 },
    );
  });
});

describe('property §12.3 — CTUD (seed cố định)', () => {
  it('CV trong miền, QU/QD khớp CV trên chuỗi cạnh ngẫu nhiên', () => {
    const program = compileOrThrow(CTUD_FILES);
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean()),
          { minLength: 5, maxLength: 30 },
        ),
        (steps) => {
          const plc = new SoftPlc(program, buildTagAddressMap([]), {
            id: 'prop-ctud',
            scanPeriodMs: PERIOD_MS,
          });
          plc.start();
          let prevT = 0;
          for (const [cu, cd, r, ld] of steps) {
            plc.write('%M0.0', cu);
            plc.write('%M0.1', cd);
            plc.write('%M0.2', r);
            plc.write('%M0.3', ld);
            plc.step(prevT, PERIOD_MS);
            prevT += PERIOD_MS;
            const cv = plc.read('%MW10') as number;
            expect(cv).toBeGreaterThanOrEqual(-32768);
            expect(cv).toBeLessThanOrEqual(32767);
            expect(plc.read('%Q0.0')).toBe(cv >= 5);
            expect(plc.read('%Q0.1')).toBe(cv <= 0);
          }
        },
      ),
      { seed: 20261125, numRuns: 50 },
    );
  });
});
