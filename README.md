# Genesis Intelligence — Build 2

Independent public-source dashboard for DOE's Genesis Mission. Not an official DOE website.

## Build 2 features

- Compact three-column Genesis Night UI: charcoal, neon green, subtle Earth-style header.
- Upper-right fictional Office of Synergy / Bureau of Strategic Integration (SI) identity.
- Automated news discovery via Cloudflare Worker endpoint `/api/news` (three Google News RSS queries, limited to DOE and national-lab domains and broader Genesis coverage); cached approximately 30 minutes.
- Selected project tracker, source guides, source classification filters, search, expandable previews, responsive mobile layout.
- When remote feeds fail, curated records remain visible with explicit feed warning.
- Build 3 conversational Genesis-specific research assistant **not yet implemented**.

## Cloudflare Workers deployment

This repository uses Wrangler static assets + Worker code. The required command is:

```sh
npx wrangler deploy
```

Wrangler config: `wrangler.jsonc`. Static assets: `dist/`. Worker: `src/worker.js`. The Worker receives `/api/*` first and serves static files from `env.ASSETS`.

If GitHub CI or Cloudflare automatic deploy was previously configured with a static-only command, switch its deploy/build command to `npx wrangler deploy`. The Cloudflare account and deployment integration must be configured by the site owner.

## Data notes

News discovery is third-party search aggregation and can fail. Headlines are not verified original DOE items until the linked article is inspected. Curated project entries are selected examples, **not** a comprehensive awards registry or persistent searchable backend. Search is over records loaded into this browser session. Live verification should include opening `/api/news`, checking the feed status indicator, and testing source links.
