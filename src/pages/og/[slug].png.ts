import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { readFile } from 'node:fs/promises';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { slugOf } from '../../lib/post.ts';

const font = (pkg: string, file: string) => readFile(new URL(`../../../node_modules/${pkg}/files/${file}`, import.meta.url));

export async function getStaticPaths() {
  const posts = await getCollection('posts');
  return posts.map((p) => ({
    params: { slug: slugOf(p) },
    props: { title: p.data.title, problem: p.data.problem },
  }));
}

export async function GET({ props }: APIContext) {
  const { title, problem } = props as { title: string; problem: string };
  const [display, mono] = await Promise.all([
    font('@fontsource/archivo', 'archivo-latin-800-normal.woff'),
    font('@fontsource/jetbrains-mono', 'jetbrains-mono-latin-500-normal.woff'),
  ]);
  const el = (type: string, style: Record<string, unknown>, children: unknown) => ({
    type,
    props: { style: { display: 'flex', ...style }, children },
  });
  const tree = el('div', { width: '100%', height: '100%', flexDirection: 'column', justifyContent: 'space-between', background: '#f4f4f2', color: '#0b0b0b', padding: 64 }, [
    el('div', { alignItems: 'center', fontFamily: 'Mono', fontSize: 24, textTransform: 'uppercase', color: '#5e5e59' }, [
      el('div', { width: 18, height: 18, borderRadius: 9, background: '#16c172', marginRight: 14 }, ''),
      `Problem · ${problem}`,
    ]),
    el('div', { fontFamily: 'Display', fontSize: title.length > 80 ? 54 : 66, lineHeight: 1.02, letterSpacing: -1 }, title),
    el('div', { fontFamily: 'Mono', fontSize: 24, color: '#5e5e59' }, 'GL/ blog.gabocodes.com'),
  ]);
  const svg = await satori(tree as never, {
    width: 1200,
    height: 630,
    fonts: [
      { name: 'Display', data: display, weight: 800, style: 'normal' },
      { name: 'Mono', data: mono, weight: 500, style: 'normal' },
    ],
  });
  const png = new Resvg(svg).render().asPng();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
}
