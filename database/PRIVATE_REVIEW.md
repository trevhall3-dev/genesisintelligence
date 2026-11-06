# Genesis Intelligence Hub 2.1: Private Partner Review

This internal collection is **not part of the public website**. It is stored in Cloudflare D1 and must only be viewed through your authenticated Cloudflare dashboard. Do **not** expose `private_partner_candidates` through `/api/*` or publish a JSON export in `dist/`.

## Evidence standard

| Status | Required interpretation |
| --- | --- |
| candidate | A project and another institution appear near explicit collaboration language in a publisher-direct article. **Not a confirmed partner.** |
| corroborated | Multiple independent, appropriate sources support the project-level relationship and role. Manual review still required. |
| verified | A human reviewer has checked a first-party source explicitly confirming that organization’s role in the specific Genesis project. |
| rejected | Ambiguous, wrong project, mere Genesis consortium membership, or unsupported. |

All candidates start `status='candidate'` and `publication_status='private'`. An organization joining the Genesis Mission consortium is *not* evidence it participates in a particular project. A project's lead institution is not its partner by default. No claims will be published automatically; approval for public display requires a separate future user-approved release.

## View the review queue

Paste the SELECT statements in `database/private_review.sql` into Cloudflare D1 → Console (in your authenticated account).

## Manual review examples (do not run until reviewed)

```sql
-- After independently inspecting the evidence:
UPDATE private_partner_candidates
SET status='verified', reviewed_at=CURRENT_TIMESTAMP,
    reviewer_note='Official lab article explicitly names this project collaborator'
WHERE id='EXACT_ID_FROM_PRIVATE_REVIEW';

-- If ambiguous or wrong:
UPDATE private_partner_candidates
SET status='rejected', reviewed_at=CURRENT_TIMESTAMP,
    reviewer_note='Consortium mention, not a project partner'
WHERE id='EXACT_ID_FROM_PRIVATE_REVIEW';
```

Leave `publication_status='private'` during Build 2.1. The ingestion system deliberately never changes a reviewed status to a less certain one.
