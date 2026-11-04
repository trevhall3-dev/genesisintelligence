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
