# Genesis Intelligence Hub (GIH) — Build 2.1: Intelligence Network Expansion

Independent public-source research dashboard about the U.S. Department of Energy's Genesis Mission. **This is not a DOE website, an official DOE project, or a DOE-endorsed resource.** "Office of Synergy" is an independent creative identity, not a government agency.

## Build 2.1 implementation

- **Approved compact masthead:** `dist/header-approved.svg` recreates the accepted composition of the GENESIS INTEL logotype with **SI superscript**, a neon-green network globe, and the Office of Synergy haloed S. This is a scalable vector recreation, not a claim that the original generated raster was uploaded verbatim.
- **Four navigation pillars:** Projects, News, Archive, and Ask Genesis AI (Build 3 placeholder).
- **News first:** searchable, compact original-source headlines and enlarged readable font. Headlines open original publisher pages in a **new tab** rather than a preview modal.
- **Projects:** searchable registry with institution, investigator, selection phase, and provisional, overlapping research tags. Full dossiers deferred.
- **Project tracker:** clickable research-area counts. Partnerships are a separate private relationship dimension, not an exclusive research category.
- **Collection health:** public `/api/health` shows non-sensitive D1 project/news counts, source status, and sync events. A status is not represented as successful until actually recorded as such.
- **Partner intelligence (private):** D1 stores unverified project/organization candidates, linked evidence, and manual review status. **No public partnership API or public relationship records.**

## Official project registry

`dist/projects.json` holds **297 publicly documented Genesis project entries** reconciled from these sources:
- [DOE July 2026 Genesis RFA roster: 278 initial selections](https://www.energy.gov/documents/genesis-mission-rfa-awards-list)
- [DOE October 2026 RFA roster: 18 further selections](https://science.osti.gov/-/media/funding/pdf/Awards-Lists/2026/GM-RFA-Awards-List_09-30-26.pdf)
- [DOE Office of Electricity GridFM 2.0 announcement: one separately documented project](https://www.energy.gov/oe/articles/does-office-electricity-announces-115m-genesis-mission-project-meet-growing-electricity)

An RFA *selection for award negotiations* does **not** necessarily constitute an obligated or disbursed award. A "Prime" in GIH means the listed lead institution, not a verified federal prime contractor. Research categories are provisional GIH classifications.

The official roster importer runs **once daily**, independently of the news jobs.

## Publisher-direct news and watchlists

`scripts/collect_genesis_news.py` contains a configurable collection of first-party publisher pages. **No Google News API or Google News RSS is used.** Sources and their collection times:

| Channel | GitHub Actions schedule (UTC) | Coverage |
| --- | --- | --- |
| DOE Genesis official listing | `17 */2 * * *` | Direct DOE Genesis news collection every two hours |
| National laboratory newsrooms | `23 */4 * * *` | Direct laboratory webpages every four hours; strict Genesis relevance |
| University / industry newsrooms | `29 */6 * * *` | A small starting set of publisher pages every six hours, expandable |
| Rotating project watchlist | `41 */4 * * *` | One-sixth of the 297-record title/alias watchlist every four hours; checks publisher pages and extracts supported project links, **not** exhaustive searches of every project website |
| Official DOE roster PDFs | `43 6 * * *` | Daily update and record reconciliation |

Each channel reports retrieval errors and keeps the older archive when a publisher cannot be reached. New links must be sufficiently Genesis-specific to enter the archive. Sources that deny or change their webpage structures may contribute no stories until revised. Related article/project links from titles, acronyms or article text remain provisional rather than verified collaborators.

`dist/news-archive.json` keeps publisher URLs and short metadata/excerpts, deduplicated. Collection workflows publish only when substantive content changes, with retry from the latest `main` to reduce concurrent-write conflicts.

## Cloudflare D1 — permanent storage and private review

`wrangler.jsonc` already includes:
- Worker `genesisintelligence`
- D1 database `genesis-intelligence-db`
- binding `DB`
- an hourly `17 * * * *` Worker Cron Trigger

`database/schema.sql` contains the complete additive schema. The Worker adds any new Build 2.1 tables automatically (without dropping your existing project/news tables). When `/api/projects` or `/api/news` finds a D1 database that has not been seeded, it queues an idempotent import from the bundled 297-project and news archives. The scheduled Worker also performs synchronization. Hashes prevent rewriting unchanged source records.

Public routes:
- `/api/projects`: D1-backed registry, with static fallback during initial synchronization
- `/api/news`: archived publisher-direct headlines, merged with D1 where available
- `/api/health`: D1 readiness, published collection-status metadata and counts only

**Private-only tables:** `organizations`, `private_partner_candidates` and review status. The collector never marks relationship claims as verified automatically. Review these with **authenticated Cloudflare D1 Console**, using `database/private_review.sql` and `database/PRIVATE_REVIEW.md`. Never expose candidate evidence via a public URL or commit a private D1 export to the repository.

## Deployment and verification

GitHub commits do not by themselves guarantee that Cloudflare's live Worker has deployed.

If Cloudflare's Git integration does not deploy automatically, deploy the current repository from an authenticated Cloudflare setup:

```sh
npx wrangler deploy
```

After the deployment, open `/api/health` on your **actual Cloudflare Worker site URL** and check `status: "synced"`, with the expected `projects: 297`. The first request can show `pending-initial-import` while its background seed runs. If it remains pending, inspect Worker Observability logs. In your private D1 Console:

```sql
SELECT COUNT(*) AS projects FROM projects;
SELECT COUNT(*) AS articles FROM news;
SELECT source,checked_at,status,message FROM collector_events ORDER BY id DESC LIMIT 12;
```

The Build 2.1 GitHub validation workflow checks JS syntax, 297 unique public projects, trusted HTTPS source URLs, the header SVG, a SQLite schema dry-run, and a Wrangler dry run. A successful CI check is **not** a live Cloudflare deployment check.

## Deferred

- Full individual project dossiers until substantial project milestones justify them
- Public partnership claims or maps, until manually verified and explicitly approved
- Build 3 **Ask Genesis AI** conversational assistant
