import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { sortPosts, postHref } from '../lib/post.ts';

export async function GET(context: APIContext) {
  const posts = sortPosts((await getCollection('posts')).filter((p) => p.data.lang === 'en'));
  return rss({
    title: 'Gabriel Londoño',
    description: 'Technical deep dives on building LLM agents in production.',
    site: context.site!,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.date,
      link: postHref(p),
    })),
  });
}
