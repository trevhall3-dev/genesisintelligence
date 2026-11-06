-- Genesis Intelligence Hub Build 2: persistent registry and source-linked intelligence
-- Apply after provisioning Cloudflare D1 database and binding it as DB.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  investigator TEXT,
  institution TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  category TEXT,
  sector TEXT,
  selection_status TEXT NOT NULL,
  selection_date TEXT,
  source_url TEXT NOT NULL,
  source_phase TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_projects_institution ON projects(institution);
CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  source TEXT,
  url TEXT NOT NULL,
  published_at TEXT,
  category TEXT,
  source_group TEXT,
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_url ON news(url);
CREATE INDEX IF NOT EXISTS idx_news_published ON news(published_at);
CREATE TABLE IF NOT EXISTS project_news (
  project_id TEXT NOT NULL REFERENCES projects(id),
  news_id TEXT NOT NULL REFERENCES news(id),
  match_method TEXT NOT NULL,
  PRIMARY KEY(project_id,news_id)
);
CREATE TABLE IF NOT EXISTS sync_runs (
  source TEXT PRIMARY KEY,
  last_checked TEXT,
  last_success TEXT,
  imported_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);


-- Build 2.1: private, evidence-linked partnership intelligence.
-- All rows below are INTERNAL; never expose them from public /api endpoints.
CREATE TABLE IF NOT EXISTS source_versions (
 source TEXT PRIMARY KEY,
 content_hash TEXT NOT NULL,
 imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 item_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS organizations (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL UNIQUE,
 organization_type TEXT,
 website TEXT,
 first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS project_tags (
 project_id TEXT NOT NULL REFERENCES projects(id),
 tag TEXT NOT NULL,
 basis TEXT NOT NULL DEFAULT 'provisional-title-classification',
 PRIMARY KEY (project_id,tag)
);
CREATE TABLE IF NOT EXISTS private_partner_candidates (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id),
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 reported_role TEXT NOT NULL DEFAULT 'potential collaborator',
 status TEXT NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate','corroborated','verified','rejected')),
 publication_status TEXT NOT NULL DEFAULT 'private' CHECK(publication_status IN ('private','approved')),
 evidence_url TEXT NOT NULL,
 evidence_excerpt TEXT,
 detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_at TEXT,
 reviewer_note TEXT,
 UNIQUE(project_id,organization_id,evidence_url)
);
CREATE INDEX IF NOT EXISTS idx_partner_review ON private_partner_candidates(status,publication_status);
CREATE INDEX IF NOT EXISTS idx_partner_project ON private_partner_candidates(project_id);
CREATE TABLE IF NOT EXISTS collector_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 source TEXT NOT NULL,
 checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 status TEXT NOT NULL CHECK(status IN ('ok','warning','error')),
 total_seen INTEGER NOT NULL DEFAULT 0,
 added INTEGER NOT NULL DEFAULT 0,
 message TEXT
);
CREATE INDEX IF NOT EXISTS idx_collector_events_date ON collector_events(checked_at DESC);
