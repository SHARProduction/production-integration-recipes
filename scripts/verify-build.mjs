import { readFile } from 'node:fs/promises';
import { recipeCatalog } from '../src/recipes.mjs';
for (const language of ['en', 'ru']) for (const recipe of recipeCatalog) {
  const html = await readFile(`dist/${language}/${recipe.id}/index.html`, 'utf8');
  if (!html.includes('SHAR Production') || !html.includes('https://sharprod.com/') || !html.includes('rel="canonical"')) throw new Error(`Incomplete public page: ${language}/${recipe.id}`);
}
const catalog = JSON.parse(await readFile('dist/catalog.json', 'utf8'));
if (catalog.works.length !== 5) throw new Error('Expected five recipe works.');
console.log('verified build: 5 works, 10 localized pages, exact SHAR Production identity');
