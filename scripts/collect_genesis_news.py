#!/usr/bin/env python3
"""Append Genesis-only discoveries to an immutable-by-identity public news archive.

Google News RSS is discovery, not original-source verification. Exclude non-Genesis
articles; store metadata and short excerpts, not full copyrighted articles.
"""
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import quote

import requests

DEST = Path("dist/news-archive.json")
SEARCHES = [
    ("DOE", 'site:energy.gov "Genesis Mission"'),
    ("Labs", '"Genesis Mission" (site:ornl.gov OR site:anl.gov OR site:lbl.gov OR site:bnl.gov OR site:pnnl.gov OR site:lanl.gov OR site:llnl.gov OR site:sandia.gov)'),
    ("Partners", '"Genesis Mission" (university OR industry OR partner OR consortium)'),
]

def normalize(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()

def collect(label, query):
    endpoint = "https://news.google.com/rss/search?q=" + quote(query + " when:90d") + "&hl=en-US&gl=US&ceid=US:en"
    response = requests.get(endpoint, timeout=35, headers={"User-Agent": "GenesisIntelligenceHub/2.0 research-index"})
    response.raise_for_status()
    tree = ET.fromstring(response.content)
    for item in tree.findall(".//channel/item"):
        rawtitle = normalize(item.findtext("title"))
        source = normalize(item.findtext("source")) or label
        title = re.sub(r"\s+-\s+[^-]+$", "", rawtitle)
        excerpt = normalize(item.findtext("description"))[:220]
        if "genesis" not in (title+" "+excerpt).lower():
            continue
        link = (item.findtext("link") or "").strip()
        if not link.startswith("https://"):
            continue
        rawdate = item.findtext("pubDate") or ""
        try:
            date = parsedate_to_datetime(rawdate).astimezone(timezone.utc).isoformat()
        except Exception:
            date = ""
        key = hashlib.sha256((title.casefold()+"|"+source.casefold()).encode()).hexdigest()[:20]
        yield {"id":key,"title":title,"summary":excerpt or "Open the original source for details.","source":source,"url":link,"date":date,"group":label,"category":"National challenges","kind":"discovery"}

def main():
    old={"items":[]}
    if DEST.exists():
        try: old=json.loads(DEST.read_text(encoding="utf-8"))
        except Exception: raise ValueError("Existing archive is invalid; refusing overwrite")
    merged={x["id"]:x for x in old.get("items",[]) if x.get("id")}
    valid_feeds=0
    for label,query in SEARCHES:
        try:
            records=list(collect(label,query))
            valid_feeds+=1
            for r in records:
                merged.setdefault(r["id"],r)
            print(label,":",len(records),"discovered")
        except Exception as e:
            print(label,": unavailable:",e)
    if valid_feeds==0:
        raise ValueError("All Genesis news discovery feeds failed; preserving archive")
    records=sorted(merged.values(),key=lambda x:x.get("date",""),reverse=True)[:4000]
    DEST.parent.mkdir(exist_ok=True,parents=True)
    DEST.write_text(json.dumps({"updated_at":datetime.now(timezone.utc).isoformat(),"count":len(records),"method":"Google News RSS Genesis-specific discovery; verify original publications","items":records},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Saved",len(records),"deduplicated Genesis news discovery records")

if __name__=="__main__": main()
