-- GIH Build 2.1 — PRIVATE REVIEW REPORT
-- Run only in your authenticated Cloudflare D1 SQL Console.
-- Never expose these tables through a public Worker API.
SELECT
  (SELECT COUNT(*) FROM projects) AS projects,
  (SELECT COUNT(*) FROM news) AS articles,
  (SELECT COUNT(*) FROM project_news) AS proposed_project_article_links,
  (SELECT COUNT(*) FROM private_partner_candidates) AS candidate_evidence_records,
  (SELECT COUNT(DISTINCT project_id) FROM private_partner_candidates) AS projects_with_candidates;

SELECT status,publication_status,COUNT(*) AS records
FROM private_partner_candidates
GROUP BY status,publication_status
ORDER BY status;

SELECT p.title AS project, p.institution AS lead_institution,
       o.name AS potential_collaborator, c.reported_role,
       c.status, c.publication_status,
       c.evidence_url, c.evidence_excerpt, c.detected_at
FROM private_partner_candidates c
JOIN projects p ON p.id=c.project_id
JOIN organizations o ON o.id=c.organization_id
WHERE c.status IN ('candidate','corroborated')
ORDER BY c.detected_at DESC
LIMIT 100;

SELECT source,status,total_seen,added,message,checked_at
FROM collector_events ORDER BY id DESC LIMIT 40;
