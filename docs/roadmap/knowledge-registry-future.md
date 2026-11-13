# Genesis Knowledge Registry — Future Release Plan
Status: APPROVED FOR FUTURE ROADMAP (2026-11-13). NOT PART OF THE UPCOMING WEEKEND BUILD.
Target: provisional Build 5/6 or later, subject to sequencing with Organization Intelligence Registry and project–challenge links.
This is a planning specification only: no production schema, collector, navigation, or API changes are authorized by this document.

## Objective
Preserve and retrieve high-value official Genesis Mission reference documents and their verifiable facts independently of the time-ordered news feed. One source may be both a news item and a durable reference. Not every reference deserves a news post.

## Scope and design
1. Curated 20–30 document seed set from existing official DOE, laboratory, and mission links; preserve original canonical URL, publisher, source publication date, discovery date, type, verification status, and review date.
2. Add additive D1 tables in a future release: knowledge_documents (canonical URL unique, title, source, dates, summary, document type, status, content hash, checked_at); knowledge_facts (document ID, concise statement, section/page locator, exact supporting URL, verification/review status); knowledge_links (document ID, target type, target ID, evidence URL, verification status). Do not create schema yet.
3. Backfill approved news URLs without rewriting news-add dates or confusing original publication dates. Canonicalize URLs, deduplicate, retain provenance, and preserve news records.
4. Link only when explicit source evidence supports associations to 33 challenges, 297 projects, labs, and eventually organizations. Do not infer official partnership from co-mentions.
5. Provide keyword search and filters by document type, publisher, topic, verification and related entity; original-source links remain primary. Future Ask Genesis SI retrieves citations and clearly separates confirmed facts from inference.
6. Refresh checks for changed/dead links; preserve metadata and historical versions. Avoid bulk copying copyrighted source text; keep summaries, permissible short excerpts and source locators.

## Editorial gate
- Core mission reference: verified official source with enduring explanatory value.
- Related reference: substantive but Genesis tie not confirmed; never imply official Genesis affiliation.
- Skip: weak or incidental Genesis link, no substantive value, or unverifiable claims.
- Require human editorial review before publication of extracted facts or relationship claims.

## Seed candidates
- DOE Genesis Mission National Science and Technology Challenges (2026-11-12)
  https://www.energy.gov/undersecretaryforscience/genesis-mission/genesis-mission-national-science-and-technology-challenges
- DOE Genesis Mission Platform (2026-11-10)
  https://www.energy.gov/undersecretaryforscience/genesis-mission/genesis-mission-platform
- Official Genesis RFA awards roster (existing project source)
  https://www.energy.gov/documents/genesis-mission-rfa-awards-list
- DOE October 2026 additional awards list (existing project source)
  https://science.osti.gov/-/media/funding/pdf/Awards-Lists/2026/GM-RFA-Awards-List_09-30-26.pdf
Additional candidates must be independently verified and curated before seed publication.

## Release acceptance criteria
- No changes to weekend release scope.
- Migration additive and reversible; old news and project views unaffected.
- Unique canonical sources; accurate original-vs-added dates.
- Every displayed fact and entity link has traceable evidence.
- Search returns relevant sources and never invents answers.
- Test desktop, iPad, phone; confirm Cloudflare D1 sync and live production separately from GitHub commit.
- Preserve existing editorial Add / Review / Skip workflow.

## Explicit deferrals
No automated full-text ingestion, paid AI APIs, organization-registry rollout, or Ask Genesis SI activation in Phase 1.
