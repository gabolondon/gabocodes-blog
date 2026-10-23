// Fails if anything internal reached dist.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const FORBIDDEN = [
  /ip_status/,
  /storytelling/i,
  /invented_domain/,
  /companion_repo/,
  /mother_of/,
  /## Audit trail/,
  /\[[a-z][a-z0-9]*(?:-[a-z0-9]+)*-url\]/,
];
const TEXT = /\.(html|xml|txt|json|js|css|svg|map)$/;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'pagefind') continue; // search index is derived from the pages already scanned
      out.push(...(await walk(p)));
    } else if (TEXT.test(e.name)) out.push(p);
  }
  return out;
}

const hits = [];
const files = await walk(DIST);
for (const f of files) {
  const s = await readFile(f, 'utf8');
  for (const re of FORBIDDEN) if (re.test(s)) hits.push(`${f.slice(DIST.length)}: ${re}`);
}
if (hits.length) {
  console.error('leak check FAILED:\n' + hits.join('\n'));
  process.exit(1);
}
console.log(`leak check ok: ${files.length} files`);
