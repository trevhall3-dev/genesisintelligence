-- Advanced Visitor Intelligence v1: additive, privacy-preserving schema.
-- No raw IP addresses, full user-agent strings, query text, or persistent cross-site identifiers.
CREATE TABLE IF NOT EXISTS visitor_sessions (
 session_id TEXT PRIMARY KEY,
 first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 country TEXT, region TEXT, city TEXT,
 asn INTEGER, network_name TEXT,
 device_type TEXT, browser_family TEXT, os_family TEXT,
 referrer_host TEXT, landing_path TEXT,
 pageviews INTEGER NOT NULL DEFAULT 0,
 events INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_vi_session_date ON visitor_sessions(first_seen_at);
CREATE INDEX IF NOT EXISTS idx_vi_session_country ON visitor_sessions(country,first_seen_at);
CREATE INDEX IF NOT EXISTS idx_vi_session_asn ON visitor_sessions(asn,first_seen_at);
CREATE TABLE IF NOT EXISTS visitor_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 session_id TEXT NOT NULL,
 event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 event_type TEXT NOT NULL CHECK(event_type IN ('page_view','search','project_open','article_open','briefing_open','section_view','source_open')),
 path TEXT,
 section TEXT,
 record_id TEXT,
 search_result_count INTEGER,
 FOREIGN KEY(session_id) REFERENCES visitor_sessions(session_id)
);
CREATE INDEX IF NOT EXISTS idx_vi_events_date ON visitor_events(event_at);
CREATE INDEX IF NOT EXISTS idx_vi_events_type_date ON visitor_events(event_type,event_at);
CREATE INDEX IF NOT EXISTS idx_vi_events_session ON visitor_events(session_id,event_at);
-- Retention: execute via a scheduled Worker task after validating deployment.
-- DELETE FROM visitor_events WHERE event_at < datetime('now','-90 days');
-- DELETE FROM visitor_sessions WHERE last_seen_at < datetime('now','-90 days');
