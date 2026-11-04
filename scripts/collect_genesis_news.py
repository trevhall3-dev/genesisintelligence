#!/usr/bin/env python3
"""Collect first-party Genesis news from official DOE listing pages.

Only directly published items are added. Source adapters can be added to SOURCES
later; Google News is not involved. Existing archived direct-source items persist.
"""
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup

DEST = Path("dist/news-archive.json")
SOURCES = [
    {
        "id": "doe-genesis",
        "name": "DOE Genesis Mission",
        "group": "DOE",
        "url": "https://www.energy.gov/undersecretaryforscience/genesis-mission/listings/genesis-mission-news",
        "pages": 5,
        "allowed_hosts": {"www.energy.gov", "energy.gov"},
    },
]
DATE_RE = re.compile(r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d\d\b")
ARTICLE_PATH = re.compile(r"/(?:science/|undersecretaryforscience/)?articles/|/articles/")

def clean(s):
    return re.sub(r"\s+", " ", s or "").strip()

def parse_date(text):
    match = DATE_RE.search(text)
    if not match:
        return ""
    try:
        return datetime.strptime(match.group(0), "%B %d, %Y").replace(tzinfo=timezone.utc).date().isoformat()
    except ValueError:
        return ""

def collect(source):
    found = {}
    for page in range(source["pages"]):
        url = source["url"] + (("?page=" + str(page)) if page else "")
        response = requests.get(url, timeout=35, headers={"User-Agent": "GenesisIntelligenceHub/2.0 (public research indexing)"})
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        main = soup.select_one("main") or soup
        active = False
        # DOE separates official listings from a subsequent Other News section.
        for element in main.find_all(["h1", "h2", "h3", "a"]):
            if element.name in ("h1", "h2", "h3"):
                label = clean(element.get_text(" ", strip=True)).lower()
                if "news from the department of energy" in label or label == "genesis mission in the news":
                    active = True
                if label == "other news":
                    active = False
                continue
            if not active:
                continue
            target = urljoin(response.url, element.get("href", ""))
            u = urlparse(target)
            if u.hostname not in source["allowed_hosts"] or not ARTICLE_PATH.search(u.path):
                continue
            title = clean(element.get_text(" ", strip=True))
            if len(title) < 18:
                continue
            container = element
            snippet = ""
            stamp = ""
            for _ in range(5):
                container = container.parent
                if container is None:
                    break
                body = clean(container.get_text(" ", strip=True))
                match = DATE_RE.search(body)
                if match and len(body) < 1600:
                    stamp = parse_date(body)
                    snippet = clean(body.replace(match.group(0), "").replace(title, "", 1))[:300]
                    break
            key = hashlib.sha256(target.split("#")[0].encode()).hexdigest()[:20]
            found[key] = {
                "id": key, "title": title,
                "summary": snippet or "Read the original DOE article for details.",
                "source": "DOE", "url": target.split("#")[0],
                "date": stamp, "group": source["group"],
                "category": "National challenges", "kind": "discovery",
                "source_method": "direct-official-listing",
            }
        if page == 0 and not found:
            raise ValueError("DOE page layout has changed or no official stories found; preserving archive")
        if page > 0 and not any(x for x in found.values()):
            break
    return list(found.values())

def main():
    old = {"items": []}
    if DEST.exists():
        old = json.loads(DEST.read_text(encoding="utf-8"))
    # Exclude legacy Google News redirects; preserve directly sourced archive entries.
    items = {}
    for d in old.get("items", []):
        if urlparse(d.get("url", "")).hostname in {"news.google.com", "www.google.com"}:
            continue
        if not d.get("title") or not d.get("url", "").startswith("https://"):
            continue
        key = hashlib.sha256(d["url"].split("#")[0].encode()).hexdigest()[:20]
        d["id"] = key
        items[key] = d
    source_states = []
    good = 0
    for source in SOURCES:
        try:
            discovered = collect(source)
            good += 1
            for d in discovered:
                items[d["id"]] = d
            source_states.append({"name":source["name"],"ok":True,"count":len(discovered)})
            print(source["name"], len(discovered), "direct articles")
        except Exception as exc:
            source_states.append({"name":source["name"],"ok":False,"count":0,"error":str(exc)})
            print(source["name"], "FAILED", exc)
    if not good:
        raise ValueError("No official direct source succeeded; previous archive retained")
    records = sorted(items.values(), key=lambda x: x.get("date", ""), reverse=True)
    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "count":len(records),
        "method":"Direct official DOE Genesis news listings; no Google News",
        "sources":source_states,
        "items":records,
    }
    DEST.write_text(json.dumps(payload,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print("Archived",len(records),"direct-source Genesis articles")

if __name__ == "__main__":
    main()
