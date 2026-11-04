#!/usr/bin/env python3
"""Build GIH's source-grounded Genesis project directory from DOE's July 2026 PDF.

Run in GitHub Actions with network access. Never silently publish a partial roster.
The listed projects were selected for award negotiations, not necessarily funded.
"""
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber
import requests

SOURCE = "https://www.energy.gov/documents/genesis-mission-rfa-awards-list"
OUTPUT = Path("dist/projects.json")
MIN_PROJECTS = 250
HEADERS = ["principal_investigator", "title", "institution", "city", "state", "zip"]
LAB = re.compile(r"(national laboratory|national labs|fermilab|slac|sandia|ames laboratory)", re.I)

def clean(v):
    return re.sub(r"\s+", " ", v or "").strip()

def category(text):
    s = text.lower()
    if re.search(r"partnership|consortium|collaborat|industry", s):
        return "Partnerships"
    if re.search(r"grid|infrastructure|compute|facility|data.center|accelerator|microchip|power.module", s):
        return "Infrastructure"
    if re.search(r"dataset|data.fusion|knowledge.graph|data.management|repository", s):
        return "Data"
    if re.search(r"foundation.model|language.model|machine.learning|ai.model|agentic|neural.network|quantum.control|autonomous", s):
        return "AI models"
    return "National challenges"

def parse_pdf(payload):
    rows = []
    with pdfplumber.open(io.BytesIO(payload)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables(table_settings={"vertical_strategy": "lines", "horizontal_strategy": "lines"}) or []:
                for cells in table:
                    if not cells or len(cells) < 6:
                        continue
                    vals = [clean(c) for c in cells[:6]]
                    if vals[0].lower().startswith("principal investigator") or vals[1].lower() == "title":
                        continue
                    if not vals[1] or not vals[2] or not vals[0]:
                        continue
                    if not re.search(r"[A-Za-z]", vals[1]):
                        continue
                    rows.append(dict(zip(HEADERS, vals)))
    return rows

def main():
    resp = requests.get(SOURCE, timeout=60, headers={"User-Agent":"GenesisIntelligenceHub/2.0 research-index (public DOE source)"})
    resp.raise_for_status()
    if not resp.content.startswith(b"%PDF"):
        raise ValueError("DOE did not return the expected PDF; refusing to overwrite the index")
    rows = parse_pdf(resp.content)
    unique = {}
    for d in rows:
        key = clean(d["title"]).casefold() + "|" + clean(d["institution"]).casefold()
        if key not in unique:
            d["id"] = "genesis-jul26-" + hashlib.sha256(key.encode()).hexdigest()[:16]
            d["category"] = category(d["title"])
            d["sector"] = "Labs" if LAB.search(d["institution"]) else "Partners"
            d["selection_status"] = "Selected for award negotiations; funding not confirmed"
            d["selection_date"] = "2026-07-22"
            d["source_url"] = SOURCE
            d["source_phase"] = "July 2026 RFA"
            unique[key] = d
    if len(unique) < MIN_PROJECTS:
        raise ValueError(f"Only {len(unique)} valid distinct records extracted; expected at least {MIN_PROJECTS}. Preserving existing index.")
    output = {"metadata":{"source":SOURCE,"retrieved_at":datetime.now(timezone.utc).isoformat(),"published_date":"2026-07-22","count":len(unique),"scope":"July 2026 DOE Genesis RFA selections for award negotiations; not a funding confirmation","category_note":"GIH research-area categories are provisional title-based classifications"},"projects":list(unique.values())}
    OUTPUT.parent.mkdir(exist_ok=True,parents=True)
    OUTPUT.write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Wrote",len(unique),"verified table records to",OUTPUT)

if __name__=="__main__":
    main()
