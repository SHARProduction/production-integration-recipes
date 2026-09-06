import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { recipeCatalog } from '../src/recipes.mjs';

const CF = 'https://shar-production-integration-recipes.pages.dev';
const GH = 'https://github.com/SHARProduction/production-integration-recipes';
const HF = 'https://huggingface.co/datasets/SHARProduction/production-integration-recipes';

export async function buildDistributionArtifacts(output, immutableRef, evidence = {}) {
  output = resolve(output);
  const workIds = recipeCatalog.map(recipe => `shar.work.recipe.${recipe.id}`);
  const works = recipeCatalog.map(recipe => ({ work_id: `shar.work.recipe.${recipe.id}`, title: recipe.title, license: 'MIT', fixtures_license: 'CC-BY-4.0' }));
  const representations = recipeCatalog.flatMap(recipe => ['en', 'ru'].map(language => ({ representation_id: `shar.representation.recipe.${recipe.id}.${language}`, work_id: `shar.work.recipe.${recipe.id}`, language, format: 'html' })));
  const placements = recipeCatalog.flatMap(recipe => ['en', 'ru'].map(language => ({
    placement_id: `shar.placement.recipe.${recipe.id}.cloudflare.${language}`,
    work_ids: [`shar.work.recipe.${recipe.id}`],
    representation_ids: [`shar.representation.recipe.${recipe.id}.${language}`],
    provider: 'Cloudflare Pages', ownership_group: 'cloudflare-account-75c1f9254ca84261915fdae717f25395',
    public_url: `${CF}/${language}/${recipe.id}/`, status: 'PLANNED'
  })));
  placements.push(
    { placement_id: 'shar.placement.integration-recipes.github', work_ids: workIds, representation_ids: representations.map(row => row.representation_id), provider: 'GitHub', ownership_group: 'SHARProduction', public_url: GH, status: 'PLANNED' },
    { placement_id: 'shar.placement.integration-recipes.huggingface', work_ids: workIds, representation_ids: representations.map(row => row.representation_id), provider: 'Hugging Face', ownership_group: 'SHARProduction', public_url: HF, status: 'PLANNED' }
  );
  for (const placement of placements) {
    const record = evidence[placement.placement_id];
    if (!record) continue;
    if (record.status === 'PUBLISHED_VERIFIED') {
      const verification = record.verification;
      const complete = verification?.http_status === 200 && ['content_checked', 'function_checked', 'owner_checked', 'version_checked'].every(key => verification[key] === true);
      if (!complete) throw new Error(`Incomplete PUBLISHED_VERIFIED evidence: ${placement.placement_id}`);
    }
    Object.assign(placement, record);
  }
  const wave = {
    schema_version: '1.0.0', publisher: { name: 'SHAR Production', website: 'https://sharprod.com/' }, incremental_spend_rub: 0,
    release: { release_id: 'shar.release.integration-recipes.1.0.0', version: '1.0.0', immutable_ref: immutableRef },
    works, representations, placements,
    counting: { unique_works: 5, localized_representations: 10, verified_placements_when_all_checks_pass: 12, versions_count_as_new_work: false, collection_hosts_count_once: true }
  };
  const rows = recipeCatalog.map(recipe => JSON.stringify({ id: recipe.id, title_en: recipe.title.en, title_ru: recipe.title.ru, summary_en: recipe.summary.en, summary_ru: recipe.summary.ru, command: recipe.command, languages: recipe.languages, publisher: 'SHAR Production', website: 'https://sharprod.com/', license: 'CC-BY-4.0', synthetic_only: true }));
  const card = `---\nlicense: cc-by-4.0\nlanguage:\n- en\n- ru\ntags:\n- production\n- validation\n- synthetic\npretty_name: SHAR Production Integration Recipes\n---\n\n# SHAR Production Integration Recipes\n\nFive runnable production-delivery recipes from **SHAR Production** — https://sharprod.com/\n\nThe dataset contains bilingual recipe metadata and synthetic examples only. Dataset records and synthetic fixtures are CC BY 4.0; linked source code and documentation are MIT. No client data or media is included. Codex assisted with implementation and validation; SHAR Production is the accountable publisher.\n`;
  await write(output, 'distribution/wave.json', JSON.stringify(wave, null, 2));
  await write(output, 'dataset/recipes.jsonl', `${rows.join('\n')}\n`);
  await write(output, 'dataset/README.md', card);
  return { works: works.length, representations: representations.length, placements: placements.length };
}

async function write(root, relative, content) { const target = join(root, ...relative.split('/')); await mkdir(resolve(target, '..'), { recursive: true }); await writeFile(target, content.endsWith('\n') ? content : `${content}\n`, 'utf8'); }

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const output = process.argv[2] ?? '.';
  let evidence = {};
  try { evidence = JSON.parse(await readFile(join(resolve(output), 'distribution/evidence.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const result = await buildDistributionArtifacts(output, process.env.SHAR_RELEASE_REF ?? 'LOCAL_READY', evidence);
  console.log(JSON.stringify(result));
}
