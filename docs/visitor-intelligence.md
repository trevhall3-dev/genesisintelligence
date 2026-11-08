# Advanced Visitor Intelligence — implementation plan (not deployed)

## Existing stack verified
Cloudflare Worker `src/worker.js`, D1 binding `DB` (`genesis-intelligence-db`), static dashboard `dist/index.html` and `dist/app.js`. Existing public endpoints: `/api/projects`, `/api/news`, `/api/health`. No visitor tracking found in these files.

## Design and safeguards
1. Add additive tables from `database/visitor_intelligence.sql` to the existing Worker MIGRATIONS, without modifying project/news tables. Apply to staging first.
2. Implement `POST /api/visitor-event` with strict same-origin checks, content-type and payload size limits, allowlisted event types, input lengths, path/record sanitization, and server-side rate limiting or Cloudflare WAF rules. Return 204; no visitor details in the response.
3. Derive approximate country/region/city/ASN from trusted Cloudflare `request.cf` metadata only, not user-submitted fields. Network name can be resolved from ASN using a vetted lookup dataset. Never infer employer or personal identity.
4. Generate a random, first-party session ID with a short expiry. Use sessionStorage for per-tab session tracking; do not use fingerprinting or IP-derived stable identifiers. Cross-visit unique people cannot be measured reliably with this design. Clearly label metrics as sessions or estimated visitors.
5. Collect: page_view, search (result count only, never query text), project_open, article_open, briefing_open, section_view, source_open. Track project identifiers and approved content paths, not arbitrary URLs.
6. Instrument `dist/app.js` and the briefing pages. Use `navigator.sendBeacon` or `fetch(...,{keepalive:true})` with bounded payloads. Do not block navigation if tracking fails.
7. Keep analytics private. Build authenticated admin access using Cloudflare Access on a separate analytics route, with identity validation at the Worker before any D1 reads. Never expose an unauthenticated analytics API or embed admin credentials in frontend JavaScript.
8. Apply retention of 90 days to session/event rows using Worker scheduled maintenance; preserve only non-identifying daily aggregates longer-term if needed. Provide a privacy notice with purpose, categories, retention, and contact method; review applicable consent requirements before using any persistent cookies.
9. Exclude bot traffic where supported, avoid recording raw IP, user-agent, search text, email, or names. Document uncertainty in geolocation and network ownership.
10. Validate staging: schema migration, origin/rate-limit tests, malformed requests, event counts, privacy tests, dashboard access-control tests, retention job, and no regression to project/news collectors. Deploy only after verification.

## Cloudflare configuration
- Existing D1 binding `DB` is sufficient. No new database is required.
- Optional Cloudflare Web Analytics is independently enabled in Cloudflare dashboard; do not assume it is active.
- Cloudflare Access application and verified JWT validation required for private analytics dashboard.
- Use existing Worker cron for retention after integration; do not create another cron unless needed.

## Rollout status
Planning and schema prepared on feature branch only. Not active on production. Do not claim visitor metrics are being collected until a test event is successfully written to D1 and read back through an authenticated path.
