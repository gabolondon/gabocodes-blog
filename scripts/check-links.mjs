// Every internal href/src in dist resolves to a file, and #fragments exist in their target page.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}
const exists = async (p) => stat(p).then((s) => s.isFile(), () => false);

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath);
  const candidates = clean.endsWith('/') ? [join(DIST, clean, 'index.html')] : [join(DIST, clean), join(DIST, clean, 'index.html')];
  for (const c of candidates) if (await exists(c)) return c;
  return null;
}

const htmlFiles = (await walk(DIST)).filter((f) => f.endsWith('.html'));
const idCache = new Map();
async function idsOf(file) {
  if (!idCache.has(file)) {
    const html = await readFile(file, 'utf8');
    idCache.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idCache.get(file);
}

const errors = [];
let checked = 0;
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const page = '/' + file.slice(DIST.length).replace(/index\.html$/, '');
  for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const raw = m[1].replace(/&amp;/g, '&');
    if (!raw || /^(https?:|mailto:|tel:|data:|javascript:|\/\/)/.test(raw)) continue;
    checked++;
    const [pathPart, frag] = raw.split('#');
    const target = pathPart.split('?')[0] || page;
    const abs = target.startsWith('/') ? target : new URL(target, 'http://x' + page).pathname;
    const f = await resolveFile(abs);
    if (!f) {
      errors.push(`${page}: broken link ${raw}`);
      continue;
    }
    if (frag && f.endsWith('.html') && !(await idsOf(f)).has(decodeURIComponent(frag))) {
      errors.push(`${page}: missing anchor ${raw}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`link check ok: ${checked} internal references in ${htmlFiles.length} pages`);
