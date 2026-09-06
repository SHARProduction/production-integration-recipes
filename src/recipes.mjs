import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const publisher = Object.freeze({ name: 'SHAR Production', website: 'https://sharprod.com/' });

export const recipeCatalog = [
  {
    id: 'subtitle-delivery-qc',
    title: { en: 'Subtitle delivery QC', ru: 'Проверка доставки субтитров' },
    summary: { en: 'Parse SRT cues, detect reversed timing and find overlaps before delivery.', ru: 'Разобрать SRT, найти обратные таймкоды и пересечения до передачи материалов.' },
    command: 'node bin/run-recipe.mjs subtitle-delivery-qc fixtures/subtitles-invalid.srt',
    languages: ['en', 'ru'], publisher
  },
  {
    id: 'deliverable-manifest-validation',
    title: { en: 'Deliverable manifest validation', ru: 'Проверка манифеста материалов' },
    summary: { en: 'Validate safe relative paths, BCP 47 locales and SHA-256 values in a handoff manifest.', ru: 'Проверить безопасные пути, локали BCP 47 и SHA-256 в манифесте передачи.' },
    command: 'node bin/run-recipe.mjs deliverable-manifest-validation fixtures/deliverables.json',
    languages: ['en', 'ru'], publisher
  },
  {
    id: 'localized-file-naming',
    title: { en: 'Localized file naming', ru: 'Имена локализованных файлов' },
    summary: { en: 'Apply one machine-readable naming contract to localized masters.', ru: 'Применить единый машиночитаемый контракт имён к локализованным мастерам.' },
    command: 'node bin/run-recipe.mjs localized-file-naming fixtures/names.json',
    languages: ['en', 'ru'], publisher
  },
  {
    id: 'production-handoff-gate',
    title: { en: 'Production handoff gate', ru: 'Гейт передачи продакшена' },
    summary: { en: 'Aggregate independent checks into an explicit RELEASE or HOLD decision.', ru: 'Собрать независимые проверки в явное решение RELEASE или HOLD.' },
    command: 'node bin/run-recipe.mjs production-handoff-gate fixtures/checks.json',
    languages: ['en', 'ru'], publisher
  },
  {
    id: 'checksum-inventory',
    title: { en: 'Checksum inventory verification', ru: 'Проверка реестра контрольных сумм' },
    summary: { en: 'Verify delivered files against a bounded SHA-256 inventory.', ru: 'Сверить переданные файлы с ограниченным реестром SHA-256.' },
    command: 'node bin/run-recipe.mjs checksum-inventory fixtures/inventory.json fixtures/files',
    languages: ['en', 'ru'], publisher
  }
];

const time = value => {
  const match = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(value);
  return match ? (((+match[1] * 60 + +match[2]) * 60 + +match[3]) * 1000 + +match[4]) : null;
};

export function checkSubtitleDelivery(text) {
  const cues = String(text).trim().split(/\r?\n\s*\r?\n/).map((block, index) => {
    const lines = block.split(/\r?\n/);
    const timing = lines.find(line => line.includes('-->'))?.split(/\s*-->\s*/);
    return { index: index + 1, start: time(timing?.[0]), end: time(timing?.[1]) };
  });
  const issues = [];
  for (const cue of cues) if (cue.start === null || cue.end === null || cue.end <= cue.start) issues.push({ code: 'CUE_REVERSED', cue: cue.index });
  for (let index = 1; index < cues.length; index++) if (cues[index].start !== null && cues[index - 1].end !== null && cues[index].start < cues[index - 1].end) issues.push({ code: 'CUE_OVERLAP', cue: cues[index].index });
  return { valid: issues.length === 0, cueCount: cues.length, issues };
}

export function validateDeliverableManifest(input) {
  const issues = [];
  for (const [index, item] of (input?.deliverables ?? []).entries()) {
    if (typeof item.path !== 'string' || /(^|[\\/])\.\.([\\/]|$)/.test(item.path) || /^[\\/]/.test(item.path)) issues.push({ code: 'PATH_UNSAFE', index });
    if (typeof item.locale !== 'string' || !/^[a-z]{2}(?:-[A-Z]{2})?$/.test(item.locale)) issues.push({ code: 'LOCALE_INVALID', index });
    if (typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256)) issues.push({ code: 'SHA256_INVALID', index });
  }
  return { valid: issues.length === 0, deliverableCount: input?.deliverables?.length ?? 0, issues };
}

export function validateLocalizedNames(names) {
  const contract = /^[a-z0-9]+(?:-[a-z0-9]+)*_[a-z0-9]+(?:-[a-z0-9]+)*_[a-z]{2}-[A-Z]{2}_v\d{2}\.[a-z0-9]+$/;
  const invalid = (names ?? []).filter(name => !contract.test(name));
  return { valid: invalid.length === 0, invalid };
}

export function evaluateHandoffGate(checks) {
  const failed = (checks ?? []).filter(check => check.passed !== true).map(check => check.name);
  return failed.length ? { decision: 'HOLD', failed } : { decision: 'RELEASE', failed: [] };
}

export async function verifyChecksumInventory(root, inventory) {
  const issues = [];
  for (const item of inventory ?? []) {
    try {
      const bytes = await readFile(join(root, item.path));
      const actual = createHash('sha256').update(bytes).digest('hex');
      if (actual !== item.sha256) issues.push({ code: 'CHECKSUM_MISMATCH', path: item.path, actual });
    } catch (error) {
      if (error.code === 'ENOENT') issues.push({ code: 'FILE_MISSING', path: item.path });
      else throw error;
    }
  }
  return { valid: issues.length === 0, checked: inventory?.length ?? 0, issues };
}
