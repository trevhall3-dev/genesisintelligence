# Genesis Intelligence Hub (GIH) — Build 2 Project Intelligence Release

Independent public-source research dashboard about DOE's Genesis Mission. **Not an official DOE website.** Office of Synergy is a creative identity, not a DOE office.

## Verified project registry — 297 public records

The source-grounded static project registry lives at `dist/projects.json`.

- **278** initial July 22, 2026 selections from [DOE's original RFA roster](https://www.energy.gov/documents/genesis-mission-rfa-awards-list)
- **18** October 8, 2026 selections (12 Phase II plus 6 Phase I) from [DOE's October award PDF](https://science.osti.gov/-/media/funding/pdf/Awards-Lists/2026/GM-RFA-Awards-List_09-30-26.pdf)
- **1** separately announced DOE Office of Electricity [GridFM 2.0 project](https://www.energy.gov/oe/articles/does-office-electricity-announces-115m-genesis-mission-project-meet-growing-electricity)

These reconcile to DOE's first-year 297-project portfolio. The RFA rosters are **selections for award negotiations**, not confirmation of actual obligated funding. Do not represent every listed project as already funded. GIH category assignments are provisional, inferred from project titles; they are not official DOE research classifications.

`scripts/import_genesis_projects.py` downloads and extracts both official PDFs, validates their completeness, deduplicates and reconciles GridFM. GitHub Actions runs the importer every two hours and on importer/workflow changes, rejecting incomplete results.

## News engine and archive

- `src/worker.js` serves the locally archived first-party DOE Genesis announcements through `/api/news` without querying Google News.
- `scripts/collect_genesis_news.py` monitors DOE’s official Genesis news listing directly and stores publisher URLs in `dist/news-archive.json`. The `SOURCES` configuration supports additional first-party feeds later. It stores short metadata and excerpts, **not** full articles.
- The feed shows compact news rows and search. Clicking a news headline opens the original publisher article directly in a new browser tab. Project records still open the dossier panel.
- `/api/projects` serves the registry; the browser searches project titles, investigators, institutions, and locations and displays project dossiers. Clickable research-area bars filter Projects & Awards.
- Article-project relationships are provisional title/alias matching and should be verified before treating a relationship as confirmed.
- Both archives are read from GitHub-built static assets even when Cloudflare D1 is not yet provisioned. **An archive file existing does not mean hourly ingestion or all sources are healthy.** Inspect feed monitoring and GitHub Actions.

## Cloudflare deployment

The Worker deploy command is:

```sh
npx wrangler deploy
```

`wrangler.jsonc` points to `src/worker.js` and static `dist/` assets, with an hourly Cron Trigger. GitHub commits do **not** by themselves prove Cloudflare has deployed.

## Optional Cloudflare D1 persistent database (requires Cloudflare account setup)

`database/schema.sql` defines tables for projects, news, many-to-many project/news links, and sync status. The Worker uses D1 **only when `DB` is actually bound**. Currently, without D1 binding, the deployed site serves static GitHub generated data and live API discovery; cron skips DB ingestion.

To provision a new D1 database under the Cloudflare account:

```sh
npx wrangler d1 create genesis-intelligence-db
```

Copy the returned database UUID into `wrangler.jsonc` under:

```json
"d1_databases": [{
  "binding": "DB",
  "database_name": "genesis-intelligence-db",
  "database_id": "ACTUAL_UUID_FROM_CLOUDFLARE"
}]
```

Then apply the schema and redeploy:

```sh
npx wrangler d1 execute genesis-intelligence-db --remote --file=database/schema.sql
npx wrangler deploy
```

After deployment, confirm `/api/projects` returns 297 entries, `/api/news` returns current results, the site's search/filters work, and records accumulate in D1. D1 setup needs Cloudflare account credentials and cannot be verified by only inspecting GitHub.

## Roadmap

**Build 2:** Preserve neon green/dark mission-control dashboard and consistent line icons; complete the public project registry, expandable project dossiers, compact news feed, source monitoring, search, GitHub-generated archive, optional D1 database, and research area filters.

**Build 3:** Ask Genesis AI conversational assistant; not currently implemented.

## Direct-source news policy (November 2026)

The DOE Genesis Mission listing is the first authoritative news collection source. Google News is **not** used by the news collector or Worker. The GitHub Actions workflow refreshes the direct-source archive every two hours, with failure protection. More official DOE, laboratory, and project partner feeds may be added later as separate entries in the collector configuration; prioritize publisher-original links and project-specific relevance. New browser tabs are opened through ordinary HTML `<a target="_blank" rel="noopener noreferrer">` links, rather than JavaScript popups.
