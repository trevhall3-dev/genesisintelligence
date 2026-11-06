#!/usr/bin/env python3
"""Free scientific discovery from arXiv Atom API; editorial queue only.

No credentials required. No automatic publication. Queries are derived from
public Genesis project/challenge titles and capped to respect source load.
"""
import datetime as dt
import hashlib
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path("dist")
OUT = pathlib.Path("review/science-discoveries.json")
ATOM = "{http://www.w3.org/2005/Atom}"
STOP = {"genesis", "mission", "national", "challenge", "project", "research", "development", "for", "and", "the", "with", "using", "science", "scientific", "technology", "advanced", "systems", "system", "new", "energy", "data", "model", "models", "artificial", "intelligence"}

def titles(path):
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return []
    items = data if isinstance(data, list) else next((v for v in data.values() if isinstance(v, list)), [])
    result = []
    for item in items:
        if isinstance(item, dict):
            value = next((item[k] for k in ("title", "name", "challenge", "project") if isinstance(item.get(k), str)), "")
            if value:
                result.append(value)
    return result

def search_terms():
    candidates = titles(ROOT / "challenges.json") + titles(ROOT / "projects.json")
    terms = []
    for title in candidates:
        words = [w.lower() for w in re.findall(r"[A-Za-z]{4,}", title) if w.lower() not in STOP]
        if len(words) >= 2:
            term = " ".join(words[:3])
            if term not in terms:
                terms.append(term)
    return terms[:8] or ["machine learning materials", "machine learning fusion", "scientific foundation models"]

def main():
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    by_url = {x["url"]: x for x in old.get("candidates", []) if x.get("url")}
    terms = search_terms()
    for idx, term in enumerate(terms):
        query = " AND ".join("all:" + w for w in term.split())
        params = urllib.parse.urlencode({"search_query": query, "start": 0, "max_results": 10, "sortBy": "submittedDate", "sortOrder": "descending"})
        request = urllib.request.Request("https://export.arxiv.org/api/query?" + params, headers={"User-Agent": "GenesisIntelHub/1.0 (scientific discovery; editorial review)"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                root = ET.fromstring(response.read(1024 * 1024))
        except Exception as exc:
            print("arXiv query failed:", term, type(exc).__name__, str(exc)[:160])
            continue
        for entry in root.findall(ATOM + "entry"):
            url = (entry.findtext(ATOM + "id") or "").strip()
            if not url.startswith("https://arxiv.org/") and not url.startswith("http://arxiv.org/"):
                continue
            url = url.replace("http://", "https://", 1)
            if url in by_url:
                by_url[url]["last_seen"] = now
                continue
            by_url[url] = {
                "id": hashlib.sha256(url.encode()).hexdigest()[:20],
                "url": url,
                "title": " ".join((entry.findtext(ATOM + "title") or "").split())[:250],
                "abstract_unverified": " ".join((entry.findtext(ATOM + "summary") or "").split())[:750],
                "source": "arXiv",
                "published_at_source": entry.findtext(ATOM + "published"),
                "discovery_query": term,
                "discovered_at": now,
                "last_seen": now,
                "classification": "unclassified",
                "review_status": "pending",
                "verified_genesis_affiliation": False,
                "publication_approved": False
            }
        if idx < len(terms) - 1:
            time.sleep(3)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"updated_at": now, "policy": "Preprints are unreviewed discovery leads, not verified Genesis projects. Confirm source, date, affiliation and relevance before approval; never publish automatically.", "queries": terms, "candidates": sorted(by_url.values(), key=lambda x: x.get("discovered_at", ""), reverse=True)[:1500]}, indent=2) + "\n")
    print("Pending science candidates:", len(by_url))
if __name__ == "__main__":
    main()
