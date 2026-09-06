#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import {
  checkSubtitleDelivery,
  evaluateHandoffGate,
  validateDeliverableManifest,
  validateLocalizedNames,
  verifyChecksumInventory
} from '../src/recipes.mjs';

const [recipe, input, root] = process.argv.slice(2);
if (!recipe || !input) {
  console.error('Usage: run-recipe <recipe-id> <input> [files-root]');
  process.exit(2);
}

let result;
if (recipe === 'subtitle-delivery-qc') result = checkSubtitleDelivery(await readFile(input, 'utf8'));
else if (recipe === 'deliverable-manifest-validation') result = validateDeliverableManifest(JSON.parse(await readFile(input, 'utf8')));
else if (recipe === 'localized-file-naming') result = validateLocalizedNames(JSON.parse(await readFile(input, 'utf8')));
else if (recipe === 'production-handoff-gate') result = evaluateHandoffGate(JSON.parse(await readFile(input, 'utf8')));
else if (recipe === 'checksum-inventory') result = await verifyChecksumInventory(root ?? '.', JSON.parse(await readFile(input, 'utf8')));
else { console.error(`Unknown recipe: ${recipe}`); process.exit(2); }

console.log(JSON.stringify(result, null, 2));
const passed = 'valid' in result ? result.valid : result.decision === 'RELEASE';
if (!passed) process.exitCode = 1;
