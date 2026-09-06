import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  checkSubtitleDelivery,
  validateDeliverableManifest,
  validateLocalizedNames,
  evaluateHandoffGate,
  verifyChecksumInventory,
  recipeCatalog
} from '../src/recipes.mjs';
import { buildSite } from '../scripts/build-site.mjs';
import { buildDistributionArtifacts } from '../scripts/build-distribution.mjs';

const sha = 'a'.repeat(64);

test('subtitle recipe catches overlap and invalid timing', () => {
  const result = checkSubtitleDelivery('1\n00:00:01,000 --> 00:00:03,000\nHello\n\n2\n00:00:02,500 --> 00:00:02,000\nWorld');
  assert.equal(result.valid, false);
  assert.deepEqual(result.issues.map(x => x.code), ['CUE_REVERSED', 'CUE_OVERLAP']);
});

test('deliverable manifest recipe requires safe paths, locale and checksum', () => {
  const result = validateDeliverableManifest({ project: 'demo', deliverables: [{ path: '../master.mov', locale: 'english', sha256: 'bad' }] });
  assert.equal(result.valid, false);
  assert.deepEqual(result.issues.map(x => x.code), ['PATH_UNSAFE', 'LOCALE_INVALID', 'SHA256_INVALID']);
});

test('localized naming recipe enforces one stable contract', () => {
  const result = validateLocalizedNames(['campaign_master_en-US_v03.mov', 'campaign_master_ru-RU_v03.mov', 'bad final.mov']);
  assert.equal(result.valid, false);
  assert.deepEqual(result.invalid, ['bad final.mov']);
});

test('handoff gate recipe aggregates checks into RELEASE or HOLD', () => {
  assert.equal(evaluateHandoffGate([{ name: 'subtitles', passed: true }, { name: 'manifest', passed: true }]).decision, 'RELEASE');
  assert.deepEqual(evaluateHandoffGate([{ name: 'subtitles', passed: false }, { name: 'manifest', passed: true }]), { decision: 'HOLD', failed: ['subtitles'] });
});

test('checksum recipe reports exact missing and mismatched files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'shar-recipe-'));
  try {
    await import('node:fs/promises').then(({ writeFile }) => writeFile(join(root, 'asset.txt'), 'SHAR Production\n'));
    const result = await verifyChecksumInventory(root, [{ path: 'asset.txt', sha256: sha }, { path: 'missing.txt', sha256: sha }]);
    assert.equal(result.valid, false);
    assert.deepEqual(result.issues.map(x => x.code), ['CHECKSUM_MISMATCH', 'FILE_MISSING']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('catalog contains five useful works with exact brand and website', () => {
  assert.equal(recipeCatalog.length, 5);
  for (const recipe of recipeCatalog) {
    assert.equal(recipe.publisher.name, 'SHAR Production');
    assert.equal(recipe.publisher.website, 'https://sharprod.com/');
    assert.deepEqual(recipe.languages, ['en', 'ru']);
  }
});

test('site build creates ten localized canonical pages and machine catalog', async () => {
  const out = await mkdtemp(join(tmpdir(), 'shar-site-'));
  try {
    const built = await buildSite(out, 'https://shar-production-integration-recipes.pages.dev');
    assert.equal(built.localizedPages, 10);
    const html = await readFile(join(out, 'en', 'subtitle-delivery-qc', 'index.html'), 'utf8');
    assert.match(html, /SHAR Production/);
    assert.match(html, /https:\/\/sharprod\.com\//);
    assert.match(html, /rel="canonical" href="https:\/\/shar-production-integration-recipes\.pages\.dev\/en\/subtitle-delivery-qc\/"/);
    const catalog = JSON.parse(await readFile(join(out, 'catalog.json'), 'utf8'));
    assert.equal(catalog.works.length, 5);
    assert.match(await readFile(join(out, 'assets', 'site.css'), 'utf8'), /grid-template-columns/);
  } finally { await rm(out, { recursive: true, force: true }); }
});

test('public CLI runs a synthetic recipe fixture', () => {
  const result = spawnSync(process.execPath, ['bin/run-recipe.mjs', 'localized-file-naming', 'fixtures/names.json'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.valid, false);
  assert.deepEqual(output.invalid, ['bad final.mov']);
});

test('distribution artifacts preserve five works and twelve honest placements', async () => {
  const out = await mkdtemp(join(tmpdir(), 'shar-distribution-'));
  try {
    const result = await buildDistributionArtifacts(out, 'b'.repeat(40));
    assert.deepEqual(result, { works: 5, representations: 10, placements: 12 });
    const wave = JSON.parse(await readFile(join(out, 'distribution', 'wave.json'), 'utf8'));
    assert.equal(wave.publisher.name, 'SHAR Production');
    assert.equal(wave.publisher.website, 'https://sharprod.com/');
    assert.equal(wave.incremental_spend_rub, 0);
    assert.equal(wave.placements.filter(x => x.provider === 'Cloudflare Pages').length, 10);
    assert.equal(wave.placements.filter(x => x.provider === 'GitHub').length, 1);
    assert.equal(wave.placements.filter(x => x.provider === 'Hugging Face').length, 1);
    const rows = (await readFile(join(out, 'dataset', 'recipes.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(rows.length, 5);
    assert.ok(rows.every(row => row.publisher === 'SHAR Production' && row.website === 'https://sharprod.com/'));
  } finally { await rm(out, { recursive: true, force: true }); }
});

test('distribution reconciliation requires complete provider evidence', async () => {
  const out = await mkdtemp(join(tmpdir(), 'shar-reconcile-'));
  const placementId = 'shar.placement.recipe.subtitle-delivery-qc.cloudflare.en';
  const verified = { status: 'PUBLISHED_VERIFIED', provider_version: 'deployment-1', verified_at: '2026-09-06T00:30:00Z', verification: { http_status: 200, content_checked: true, function_checked: true, owner_checked: true, version_checked: true } };
  try {
    await buildDistributionArtifacts(out, 'b'.repeat(40), { [placementId]: verified });
    const wave = JSON.parse(await readFile(join(out, 'distribution', 'wave.json'), 'utf8'));
    assert.equal(wave.placements.find(row => row.placement_id === placementId).status, 'PUBLISHED_VERIFIED');
    await assert.rejects(buildDistributionArtifacts(out, 'b'.repeat(40), { [placementId]: { ...verified, verification: { ...verified.verification, function_checked: false } } }), /Incomplete PUBLISHED_VERIFIED evidence/);
  } finally { await rm(out, { recursive: true, force: true }); }
});
