# gabocodes-blog

Static blog for `blog.gabocodes.com`. Astro, plain CSS with custom-property tokens, self-hosted fonts (Fontsource), Pagefind search.

## Run

```sh
nvm use            # Node 24 (.nvmrc)
pnpm install
pnpm run dev        # FIXTURE=1: includes the example fixture post
pnpm run build      # production build + Pagefind index into dist/ (fixture excluded)
pnpm run check      # astro check + vitest + build (FIXTURE=1) + pagefind + link check + no-leak check
```

The fixture post `src/content/posts/en/example-fixture.md` exercises every component. It is only loaded when
`FIXTURE=1` (dev and `pnpm run check`); the production build never includes it.

## How a post arrives

ghostwriter `scripts/export_blog.py` writes `src/content/posts/<lang>/<slug>.md`. The frontmatter schema is strict
(`src/content.config.ts`): unknown keys fail the build. Review the diff, then commit and push.

`### Under the hood: …` headings become a closed `<details>` automatically; no MDX needed.

## TODO-REVIEW

- Author bio text (`src/lib/bio.ts`, shown in `AuthorBio` and `/about`): from the old portfolio (gabrielportfolio.pages.dev), to refresh when that profile is updated. It is the only place the employer appears.
- Open Graph images use Archivo and JetBrains Mono; check them once with the real post.

## Launch steps (Gabriel)

Cloudflare now deploys Git-connected static sites as a Worker with static assets (Workers Builds), configured by `wrangler.jsonc` in this repo. There is no framework preset or output-directory field in the dashboard: `wrangler.jsonc` says the assets live in `dist/`.

1. ~~Publish `agent-upgrade-demo`~~, ~~export the first post~~, ~~create the GitHub repo~~ (done).
2. `git push` so `wrangler.jsonc` is on `main`.
3. Dashboard: Workers & Pages → Create → Import a repository → GitHub → `gabolondon/gabocodes-blog`.
4. Project name `gabocodes-blog` (must match `name` in `wrangler.jsonc`). Build command: `pnpm run build`. Deploy command: `pnpm exec wrangler deploy` (wrangler is a pinned devDependency; `pnpm-workspace.yaml` allows the esbuild and workerd build scripts that pnpm blocks by default). Production branch `main`.
5. Node version: comes from `.nvmrc` (24). Do not add a `NODE_VERSION` variable; if one exists, delete it or set it to `24`. Do not set `FIXTURE`.
6. Deploy. The first build gives a `gabocodes-blog.<account>.workers.dev` URL; check it loads.
7. Settings → Domains & Routes → Add → Custom domain → `blog.gabocodes.com`.
8. Web Analytics: Cloudflare dashboard → Analytics & Logs → Web Analytics → add the site (`blog.gabocodes.com`), automatic setup.
9. Check: home with the agent post as lead and "Latest" with the extraction series; no bakery fixture post.

After that, every push to `main` builds and deploys. Rollback: the Worker's Deployments tab.
