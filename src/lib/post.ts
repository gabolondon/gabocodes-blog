import type { CollectionEntry } from 'astro:content';
import { TOPIC_LABELS } from './topic-labels.ts';

export type Post = CollectionEntry<'posts'>;

export const slugOf = (p: { id: string }) => p.id.split('/').pop()!.replace(/\.md$/, '');

export const sortPosts = (posts: Post[]) =>
  [...posts].sort((a, b) => b.data.date.getTime() - a.data.date.getTime());

export function pickLead(posts: Post[]): Post | undefined {
  const sorted = sortPosts(posts);
  return sorted.find((p) => p.data.featured) ?? sorted[0];
}

export function readMinutes(body: string | undefined): number {
  const words = (body ?? '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export const formatMonth = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function topicLabel(slug: string): string {
  return TOPIC_LABELS[slug] ?? slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export function topicsOf(posts: Post[]): string[] {
  return [...new Set(posts.flatMap((p) => p.data.tags))].sort();
}

/** Labels for a post's repo: an example repo shows the pattern, a project repo is the real thing. */
export function repoLabels(d: { repo_kind: 'example' | 'project' }) {
  const example = d.repo_kind === 'example';
  return { example, stack: example ? 'Example stack' : 'Stack', repo: example ? 'Runnable repo' : 'Repo' };
}

export const repoName = (url: string) => url.replace(/\/+$/, '').split('/').pop() ?? url;

export const postHref = (p: Post) => `${p.data.lang === 'es' ? '/es' : ''}/writing/${slugOf(p)}/`;
