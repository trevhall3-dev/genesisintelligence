#!/usr/bin/env python3
"""Google Programmable Search discovery. Candidates are NEVER published automatically."""
import datetime
import hashlib
import json
import os
import pathlib
import urllib.parse
import urllib.request

OUT = pathlib.Path("review/google-discoveries.json")
QUERIES = [
    '"Genesis Mission" site:energy.gov',
    '"Genesis Mission" national laboratory',
    '"Genesis Mission" artificial intelligence research',
    '"Genesis Mission" university project',
    '"scientific AI" national laboratory research',
]
def main():
    key = os.getenv("GOOGLE_SEARCH_API_KEY")
    cx = os.getenv("GOOGLE_SEARCH_ENGINE_ID")
    if not key or not cx:
        print("Google Discovery not active: GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID required.")
        return 0
    existing = json.loads(OUT.read_text()) if OUT.exists() else {"candidates": []}
    by_url = {x["url"]: x for x in existing.get("candidates", [])}
    checked = datetime.datetime.now(datetime.timezone.utc).isoformat()
    for query in QUERIES:
        params = urllib.parse.urlencode({"key": key, "cx": cx, "q": query, "num": 10})
        req = urllib.request.Request("https://www.googleapis.com/customsearch/v1?" + params, headers={"User-Agent": "GenesisIntelHub-Discovery/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=25) as response:
                results = json.load(response)
        except Exception as exc:
            print("Discovery query failed:", query, type(exc).__name__, str(exc)[:180])
            continue
        for item in results.get("items", []):
            url = item.get("link", "")
            parsed = urllib.parse.urlparse(url)
            if parsed.scheme != "https" or not parsed.hostname:
                continue
            if url in by_url:
                by_url[url]["last_seen"] = checked
                continue
            by_url[url] = {
                "id": hashlib.sha256(url.encode()).hexdigest()[:20],
                "url": url,
                "title": item.get("title", "")[:250],
                "search_snippet_unverified": item.get("snippet", "")[:500],
                "discovered_at": checked,
                "last_seen": checked,
                "discovery_query": query,
                "classification": "unclassified",
                "review_status": "pending",
                "verified_original_source": False,
                "publication_approved": False
            }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"updated_at": checked, "policy": "Search results are unverified leads; verify original publisher, date, affiliation, and Genesis relationship before editorial approval. Never publish pending candidates.", "candidates": sorted(by_url.values(), key=lambda x: x.get("discovered_at", ""), reverse=True)[:1500]}, indent=2) + "\n")
    print("Google Discovery candidates:", len(by_url))
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
