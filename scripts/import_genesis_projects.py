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

SOURCES = [
    ("July 2026 RFA","https://www.energy.gov/documents/genesis-mission-rfa-awards-list","2026-07-22",250),
    ("October 2026 RFA","https://science.osti.gov/-/media/funding/pdf/Awards-Lists/2026/GM-RFA-Awards-List_09-30-26.pdf","2026-10-08",18),
]
SOURCE = SOURCES[0][1]
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
    unique = {}
    source_counts = {}
    for phase, source, date, minimum in SOURCES:
        resp = requests.get(source, timeout=60, headers={"User-Agent":"GenesisIntelligenceHub/2.0 (public DOE research index)"})
        resp.raise_for_status()
        if not resp.content.startswith(b"%PDF"):
            raise ValueError(f"{phase}: invalid PDF; preserving previous index")
        rows = parse_pdf(resp.content)
        if len(rows) < minimum:
            raise ValueError(f"{phase}: only {len(rows)} entries; expected at least {minimum}; preserving previous index")
        source_counts[phase] = len(rows)
        for d in rows:
            key = clean(d["title"]).casefold() + "|" + clean(d["institution"]).casefold()
            if key in unique:
                continue
            d["id"] = "genesis-" + hashlib.sha256(key.encode()).hexdigest()[:20]
            d["category"] = category(d["title"])
            d["sector"] = "Labs" if LAB.search(d["institution"]) else "Partners"
            d["selection_status"] = "Selected for award negotiations; funding not confirmed"
            d["selection_date"] = date
            d["source_url"] = source
            d["source_phase"] = phase
            unique[key] = d
    # GridFM 2.0 was announced separately by DOE's Office of Electricity on September 1.
    gridfm = {
        "principal_investigator": "", "title": "Foundation Models for the Electric Grid: From Proof of Concept to Real-world Impacts (GridFM 2.0)",
        "institution": "Brookhaven National Laboratory (BNL)", "city": "Upton", "state": "NY", "zip": "",
        "category": "Infrastructure", "sector": "Labs",
        "selection_status": "DOE announced $11.5M Genesis research project",
        "selection_date": "2026-09-01",
        "source_url": "https://www.energy.gov/oe/articles/does-office-electricity-announces-115m-genesis-mission-project-meet-growing-electricity",
        "source_phase": "Office of Electricity 2026"
    }
    gridkey = gridfm["title"].casefold() + "|" + gridfm["institution"].casefold()
    gridfm["id"] = "genesis-" + hashlib.sha256(gridkey.encode()).hexdigest()[:20]
    if not any("gridfm 2.0" in p["title"].casefold() for p in unique.values()):
        unique[gridkey] = gridfm
    if len(unique) < 290:
        raise ValueError(f"Only {len(unique)} distinct projects assembled; refusing to publish partial index")
    output = {"metadata":{"sources":[x[1] for x in SOURCES]+[gridfm["source_url"]],"retrieved_at":datetime.now(timezone.utc).isoformat(),"count":len(unique),"source_counts":source_counts,"scope":"July and October 2026 DOE Genesis RFA lists plus separately announced DOE GridFM 2.0. RFA selection is not confirmation of obligated funding.","category_note":"Research-area categories are GIH provisional title-based classifications"},"projects":list(unique.values())}
    OUTPUT.parent.mkdir(exist_ok=True,parents=True)
    OUTPUT.write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Wrote",len(unique),"verified table records to",OUTPUT)

if __name__=="__main__":
    main()
