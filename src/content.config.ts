import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// The fixture post exercises every component; it only exists in dev and in `npm run check`.
const pattern = process.env.FIXTURE === '1' ? '**/*.md' : ['**/*.md', '!**/example-fixture.md'];

export const postSchema = z
  .object({
    title: z.string(),
    description: z.string(),
    problem: z.string().max(70),
    tags: z.array(z.string()),
    date: z.coerce.date(),
    lang: z.enum(['en', 'es']),
    i18n_key: z.string(),
    stack: z.array(z.string()).optional(),
    result: z.string().optional(),
    repo_url: z.url().optional(),
    // 'example': a companion repo that shows the pattern; 'project': the real, public project itself
    repo_kind: z.enum(['example', 'project']).default('example'),
    terminal: z
      .array(
        z.object({
          text: z.string(),
          tone: z.enum(['cmd', 'ok', 'bad', 'dim']).optional(),
        }),
      )
      .max(8)
      .optional(),
    featured: z.boolean().default(false),
  })
  .strict();

export const collections = {
  posts: defineCollection({ loader: glob({ pattern, base: './src/content/posts' }), schema: postSchema }),
};
