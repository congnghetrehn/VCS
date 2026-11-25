// Docgen thiết bị — sinh docs/equipment/<type>.md từ định nghĩa model
// (M2 §2, P2.2 — OQ-260). Hàm thuần, tất định: cùng model → cùng markdown.

import type { EquipmentModel } from './registry.js';

/** Đọc `.describe()` của 1 field trong paramsSchema (zod object), '' nếu không có. */
function zodFieldDescription(schema: unknown, key: string): string {
  if (typeof schema !== 'object' || schema === null) return '';
  const shape = (schema as { shape?: unknown }).shape;
  if (typeof shape !== 'object' || shape === null) return '';
  const field = (shape as Record<string, unknown>)[key];
  if (typeof field !== 'object' || field === null) return '';
  const desc = (field as { description?: unknown }).description;
  return typeof desc === 'string' ? desc : '';
}

function fmtDefault(v: unknown): string {
  if (typeof v === 'string') return `"${v}"`;
  if (typeof v === 'number' && !Number.isInteger(v)) return String(v);
  return String(v);
}

/** Sinh markdown tài liệu cho 1 model thiết bị (tất định, LF, kết thúc bằng \n). */
export function generateEquipmentMarkdown(model: EquipmentModel): string {
  const lines: string[] = [
    `# ${model.type}`,
    '',
    '> File sinh tự động bởi `pnpm docs:equipment` (`scripts/gen-equipment-docs.ts`). Không sửa tay.',
    '',
    model.description,
    '',
    `Phiên bản: \`${model.version}\``,
    '',
    '## Roles',
    '',
    '| Role | Kind | Kiểu | Bắt buộc | Synonyms |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const r of model.roles) {
    const type = r.unit !== undefined ? `${r.dataType} (${r.unit})` : r.dataType;
    lines.push(
      `| \`${r.role}\` | ${r.kind} | ${type} | ${r.optional === true ? 'không' : 'có'} | ${r.synonyms.map((s) => `\`${s}\``).join(', ')} |`,
    );
  }
  lines.push('', '## Tham số', '', '| Tham số | Mặc định | Mô tả |', '| --- | --- | --- |');
  const defaults = model.defaultParams as Record<string, unknown>;
  for (const key of Object.keys(defaults)) {
    lines.push(
      `| \`${key}\` | \`${fmtDefault(defaults[key])}\` | ${zodFieldDescription(model.paramsSchema, key)} |`,
    );
  }
  lines.push('', '## Observables', '', '| Key | Mô tả |', '| --- | --- |');
  for (const o of model.observables) {
    const unit = o.unit !== undefined ? ` (${o.unit})` : '';
    lines.push(`| \`${o.key}\` | ${o.description}${unit} |`);
  }
  lines.push('', '## Lỗi thiết bị', '', '| ID | Mô tả |', '| --- | --- |');
  for (const f of model.faults) {
    lines.push(`| \`${f.id}\` | ${f.description} |`);
  }
  if (model.presets !== undefined && Object.keys(model.presets).length > 0) {
    lines.push('', '## Preset', '', '| Preset | Lỗi | Mô tả |', '| --- | --- | --- |');
    for (const [name, p] of Object.entries(model.presets)) {
      const fault =
        p.signalFault !== undefined
          ? `signal ${p.signalFault.type} trên \`${p.signalFault.role}\``
          : p.equipmentFault !== undefined
            ? `equipment \`${p.equipmentFault.fault}\``
            : '—';
      lines.push(`| \`${name}\` | ${fault} | ${p.description} |`);
    }
  }
  if (model.docs?.states !== undefined && model.docs.states.length > 0) {
    lines.push('', '## Trạng thái', '', '| Trạng thái | Mô tả |', '| --- | --- |');
    for (const s of model.docs.states) {
      lines.push(`| \`${s.state}\` | ${s.description} |`);
    }
  }
  if (model.docs?.transitions !== undefined && model.docs.transitions.length > 0) {
    lines.push('', '## Chuyển đổi', '');
    for (const t of model.docs.transitions) {
      lines.push(`- ${t}`);
    }
  }
  if (model.docs?.notes !== undefined && model.docs.notes.length > 0) {
    lines.push('', '## Ghi chú', '');
    for (const n of model.docs.notes) {
      lines.push(`- ${n}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}
