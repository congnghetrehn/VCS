# io-list-300-clean — biến thể commit được của fixture 300 (G2 §34)

- Nguồn: cùng seed 20261126 với `fixtures/io-list-300.*`, chỉ tắt dirt trùng
  (`scripts/gen-io-fixture.ts --clean-duplicates`: duplicateTag 6 +
  duplicateAddress 6 → 0; giữ missingType 15 + suffixVariant 9 — không sinh lỗi).
- Khác gốc đúng 12 dòng (6 tag + 6 địa chỉ khôi phục); dirtyRows 24 (gốc 36).
- Dùng cho e2e §14 #8 (`apps/web/e2e/g2-full-flow.spec.ts`): import → commit qua wizard.
- KHÔNG dùng cho precision harness §11.3 — harness vẫn dùng fixture bẩn gốc
  (`fixtures/io-list-300.*`, assert 18 lỗi/23 warnings).
- Sinh lại: `pnpm gen:io-fixture --out fixtures/io-list-300-clean --clean-duplicates`.
