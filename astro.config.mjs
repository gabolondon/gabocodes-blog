import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import sitemap from '@astrojs/sitemap';
import { remarkUnderTheHood } from './src/lib/remark-under-the-hood.ts';
import { rehypeDataTable } from './src/lib/rehype-data-table.ts';
import { shikiTitleBar } from './src/lib/shiki-title-bar.ts';

export default defineConfig({
  site: 'https://blog.gabocodes.com',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap()],
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es'],
    routing: { prefixDefaultLocale: false },
  },
  markdown: {
    processor: unified({ remarkPlugins: [remarkUnderTheHood], rehypePlugins: [rehypeDataTable] }),
    shikiConfig: { theme: 'tokyo-night', transformers: [shikiTitleBar()] },
  },
});
