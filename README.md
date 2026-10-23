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

## Launch steps (Gabriel; nothing here has been run)

1. ~~Publish `agent-upgrade-demo` to GitHub~~ (github.com/gabolondon/agent-upgrade-demo).
2. ~~Re-approve blog v4 and export it~~ (done 2026-10-23: `src/content/posts/en/agent-upgrade-journey.md`).
3. `pnpm run check`, review, commit.
4. Create the GitHub repo and push.
5. Create the Cloudflare Pages project: build command `pnpm run build` (Pages detects pnpm from `pnpm-lock.yaml` and `packageManager`), output directory `dist`, Node 24 (`NODE_VERSION=24`).
6. Add the custom domain `blog.gabocodes.com` (CNAME in the `gabocodes.com` zone).
7. Enable Cloudflare Web Analytics from the Pages dashboard (cookieless, nothing to add to the repo).
8. Confirm `FIXTURE` is not set in the Pages environment; delete the fixture post if you do not want it in the repo.
