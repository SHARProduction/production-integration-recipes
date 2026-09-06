import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { recipeCatalog } from '../src/recipes.mjs';

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const labels = {
  en: { eyebrow: 'Runnable integration recipe', use: 'Run locally', expected: 'Expected result', back: 'All recipes', expectedText: 'The command returns structured JSON and a non-zero exit code when the delivery gate fails.' },
  ru: { eyebrow: 'Исполняемый интеграционный рецепт', use: 'Локальный запуск', expected: 'Ожидаемый результат', back: 'Все рецепты', expectedText: 'Команда возвращает структурированный JSON и ненулевой код, если гейт передачи не пройден.' }
};

export async function buildSite(output, base = 'https://shar-production-integration-recipes.pages.dev') {
  output = resolve(output); base = base.replace(/\/$/, '');
  await rm(output, { recursive: true, force: true }); await mkdir(output, { recursive: true });
  const urls = [];
  for (const language of ['en', 'ru']) {
    const cards = recipeCatalog.map(recipe => `<article><h2><a href="/${language}/${recipe.id}/">${escape(recipe.title[language])}</a></h2><p>${escape(recipe.summary[language])}</p></article>`).join('\n');
    await write(output, `${language}/index.html`, page({ title: language === 'en' ? 'Production integration recipes' : 'Интеграционные рецепты продакшена', description: language === 'en' ? 'Five runnable delivery workflows from SHAR Production.' : 'Пять исполняемых сценариев передачи материалов от SHAR Production.', canonical: `${base}/${language}/`, alternate: `${base}/${language === 'en' ? 'ru' : 'en'}/`, language, body: `<main><p class="eyebrow">SHAR Production</p><h1>${language === 'en' ? 'Production integration recipes' : 'Интеграционные рецепты продакшена'}</h1><p>${language === 'en' ? 'Small, deterministic workflows for delivery teams. No client data or paid services.' : 'Небольшие детерминированные процессы для команд передачи. Без клиентских данных и платных сервисов.'}</p><section class="grid">${cards}</section></main>` }));
    urls.push(`${base}/${language}/`);
    for (const recipe of recipeCatalog) {
      const canonical = `${base}/${language}/${recipe.id}/`;
      const alternate = `${base}/${language === 'en' ? 'ru' : 'en'}/${recipe.id}/`;
      const body = `<main><a href="/${language}/">← ${labels[language].back}</a><p class="eyebrow">${labels[language].eyebrow}</p><h1>${escape(recipe.title[language])}</h1><p>${escape(recipe.summary[language])}</p><h2>${labels[language].use}</h2><pre><code>${escape(recipe.command)}</code></pre><h2>${labels[language].expected}</h2><p>${labels[language].expectedText}</p><p><a href="https://sharprod.com/">SHAR Production · sharprod.com</a></p></main>`;
      await write(output, `${language}/${recipe.id}/index.html`, page({ title: recipe.title[language], description: recipe.summary[language], canonical, alternate, language, body }));
      urls.push(canonical);
    }
  }
  const works = recipeCatalog.map(recipe => ({ work_id: `shar.work.recipe.${recipe.id}`, title: recipe.title, summary: recipe.summary, languages: recipe.languages, publisher: recipe.publisher, license: 'MIT', fixtures_license: 'CC-BY-4.0', command: recipe.command }));
  await write(output, 'catalog.json', JSON.stringify({ schema_version: '1.0.0', publisher: { name: 'SHAR Production', website: 'https://sharprod.com/' }, works }, null, 2));
  await write(output, 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url => `<url><loc>${url}</loc></url>`).join('')}</urlset>`);
  await write(output, 'robots.txt', `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
  await write(output, '_headers', `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n`);
  await write(output, 'assets/site.css', await readFile(new URL('../assets/site.css', import.meta.url), 'utf8'));
  return { localizedPages: recipeCatalog.length * 2, totalUrls: urls.length, output };
}

async function write(root, relative, content) { const target = join(root, ...relative.split('/')); await mkdir(resolve(target, '..'), { recursive: true }); await writeFile(target, content.endsWith('\n') ? content : `${content}\n`, 'utf8'); }
function page({ title, description, canonical, alternate, language, body }) {
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'TechArticle', headline: title, description, inLanguage: language, author: { '@type': 'Organization', name: 'SHAR Production', url: 'https://sharprod.com/' }, publisher: { '@type': 'Organization', name: 'SHAR Production', url: 'https://sharprod.com/' } });
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · SHAR Production</title><meta name="description" content="${escape(description)}"><link rel="canonical" href="${canonical}"><link rel="alternate" hreflang="${language === 'en' ? 'ru' : 'en'}" href="${alternate}"><link rel="alternate" hreflang="${language}" href="${canonical}"><script type="application/ld+json">${ld}</script><link rel="stylesheet" href="/assets/site.css"></head><body><header><a href="https://sharprod.com/" aria-label="SHAR Production home"><strong>SHAR</strong> Production</a></header>${body}<footer>MIT code and documentation · CC BY 4.0 synthetic fixtures · <a href="https://sharprod.com/">sharprod.com</a></footer></body></html>`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = await buildSite(process.argv[2] ?? 'dist', process.env.SHAR_RECIPES_BASE_URL);
  console.log(JSON.stringify(result));
}
