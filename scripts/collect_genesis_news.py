#!/usr/bin/env python3
"""Genesis Intelligence 2.1: first-party-only news and project watchlist collector.

Channels: doe / labs / partners / projects. Network queries are first-party
publisher pages, never Google News. A project name alone is not partnership evidence.
"""
import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse
import requests
from bs4 import BeautifulSoup

ARCHIVE = Path("dist/news-archive.json")
REGISTRY = Path("dist/projects.json")
NEWS_URL = "https://www.energy.gov/undersecretaryforscience/genesis-mission/listings/genesis-mission-news"
SOURCES = [
    dict(id="doe-genesis",name="DOE Genesis Mission News",group="DOE",url=NEWS_URL,host="energy.gov",mode="doe",pages=4,cap=40),
    # Direct laboratory publisher indexes, not broad aggregator RSS.
    dict(id="ornl",name="Oak Ridge National Laboratory",group="Labs",url="https://www.ornl.gov/news",host="ornl.gov",pages=1,cap=15),
    dict(id="argonne",name="Argonne National Laboratory",group="Labs",url="https://www.anl.gov/news",host="anl.gov",pages=1,cap=15),
    dict(id="brookhaven",name="Brookhaven National Laboratory",group="Labs",url="https://www.bnl.gov/newsroom/",host="bnl.gov",pages=1,cap=15),
    dict(id="lbnl",name="Lawrence Berkeley National Laboratory",group="Labs",url="https://newscenter.lbl.gov/",host="lbl.gov",pages=1,cap=15),
    dict(id="pnnl",name="Pacific Northwest National Laboratory",group="Labs",url="https://www.pnnl.gov/news",host="pnnl.gov",pages=1,cap=15),
    dict(id="lanl",name="Los Alamos National Laboratory",group="Labs",url="https://www.lanl.gov/media/news/",host="lanl.gov",pages=1,cap=15),
    dict(id="llnl",name="Lawrence Livermore National Laboratory",group="Labs",url="https://www.llnl.gov/articles",host="llnl.gov",pages=1,cap=15),
    dict(id="fermilab",name="Fermilab",group="Labs",url="https://news.fnal.gov/",host="fnal.gov",pages=1,cap=15),
    dict(id="sandia",name="Sandia National Laboratories",group="Labs",url="https://newsreleases.sandia.gov/",host="sandia.gov",pages=1,cap=15),
    # First-party research/industry newsrooms. New sources can be appended here.
    dict(id="mit",name="MIT News",group="Partners",url="https://news.mit.edu/",host="mit.edu",pages=1,cap=12),
    dict(id="caltech",name="Caltech News",group="Partners",url="https://www.caltech.edu/about/news",host="caltech.edu",pages=1,cap=12),
    dict(id="stanford",name="Stanford Report",group="Partners",url="https://news.stanford.edu/",host="stanford.edu",pages=1,cap=12),
    dict(id="ibm",name="IBM Newsroom",group="Partners",url="https://newsroom.ibm.com/",host="ibm.com",pages=1,cap=12),
]
SEED_ARTICLES = [
    ("Labs","Brookhaven Lab to Lead $14M AI Project for Nation's Electric Grid","https://www.bnl.gov/newsroom/news.php?a=223136","Brookhaven National Laboratory"),
    ("Labs","ORNL Selected for Six Phase II Genesis Mission Awards","https://www.ornl.gov/news/ornl-selected-for-six-phase-ii-genesis-mission-awards/","Oak Ridge National Laboratory"),
]
ARTICLE_HINTS = ("news","article","story","press","research","release","features","insight")
DATE = re.compile(r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d\d\b")
GENESIS = re.compile(r"\bgenesis\s+mission\b|\bquantum\s+genesis\b",re.I)
HEADERS={"User-Agent":"GenesisIntelHub/2.1 (independent public-source research; modest polling)"}

def clean(s):
    return re.sub(r"\s+"," ",str(s or "")).strip()

def normurl(url):
    p=urlparse(url)
    return urlunparse((p.scheme,p.netloc,p.path,p.params,p.query,""))

def permitted(url,host):
    p=urlparse(url)
    return p.scheme=="https" and bool(p.hostname) and (p.hostname==host or p.hostname.endswith("."+host))

def response_page(url):
    r=requests.get(url,timeout=24,headers=HEADERS)
    r.raise_for_status()
    if "html" not in r.headers.get("content-type","text/html").lower():
        raise ValueError("Not an HTML publisher page")
    return BeautifulSoup(r.text,"html.parser"),r.url

def parse_date(value):
    match=DATE.search(value)
    if match:
        try:return datetime.strptime(match.group(0),"%B %d, %Y").date().isoformat()
        except ValueError:pass
    return ""

def registered():
    data=json.loads(REGISTRY.read_text(encoding="utf-8"))
    projects=data.get("projects",[])
    if len(projects)<290: raise ValueError("Genesis watchlist not populated")
    return projects

def aliases(project):
    title=clean(project["title"])
    parts=[title]
    parts.extend(re.findall(r"\b[A-Z][A-Z0-9-]{3,}\b",title))
    return [p for p in parts if p.upper() not in {"GENESIS","MISSION","DOE","PROJECT","AI","MODEL","SCIENCE","DATA","ENERGY","PHASE","PROJECTS"}]

def project_ids(text,projects):
    hay=text.lower()
    ids=[]
    for p in projects:
        title=clean(p["title"])
        # Full project titles are higher-signal; stand-alone acronyms require Genesis context.
        if len(title)>24 and title.lower() in hay:
            ids.append(p["id"])
            continue
        if not GENESIS.search(text):continue
        acronyms=[a for a in aliases(p)[1:] if len(a)>3 and any(c.isdigit() for c in a) or len(a)>5]
        if any(re.search(r"\b"+re.escape(a)+r"\b",text,re.I) for a in acronyms):
            ids.append(p["id"])
    return ids[:8]

def record(title,url,source,date,summary,project_ids=None,verified_type="publisher-direct"):
    u=normurl(url)
    return {
        "id":hashlib.sha256(u.encode()).hexdigest()[:20],
        "title":clean(title)[:250],"summary":clean(summary)[:300],
        "source":source["name"],"url":u,"date":date,
        "group":source["group"],"category":"National challenges","kind":"discovery",
        "source_method":verified_type,"project_ids":project_ids or []
    }

def doe_index(source):
    found={}
    for page in range(source["pages"]):
        url=source["url"]+("?page="+str(page) if page else "")
        soup,actual=response_page(url)
        main=soup.select_one("main") or soup
        active=False
        for node in main.find_all(["h1","h2","h3","a"]):
            if node.name!="a":
                heading=clean(node.get_text(" ",strip=True)).lower()
                if "news from the department of energy" in heading or heading=="genesis mission in the news":
                    active=True
                elif heading=="other news":active=False
                continue
            if not active:continue
            link=urljoin(actual,node.get("href",""))
            if not permitted(link,"energy.gov") or "/articles/" not in urlparse(link).path:continue
            title=clean(node.get_text(" ",strip=True))
            if len(title)<18:continue
            parent=node
            summary="Official DOE Genesis Mission announcement."
            date=""
            for _ in range(5):
                parent=parent.parent
                if not parent:break
                snippet=clean(parent.get_text(" ",strip=True))
                if len(snippet)>1600:break
                d=parse_date(snippet)
                if d:
                    date=d;summary=snippet.replace(title,"",1)[:300];break
            item=record(title,link,source,date,summary)
            found[item["id"]]=item
    if not found:raise ValueError("DOE listing yielded no official articles; retaining previous archive")
    return list(found.values())

def article_body(link,host):
    soup,actual=response_page(link)
    if not permitted(actual,host):return "", ""
    # Remove non-content elements before extracting public article text.
    for node in soup.find_all(["script","style","nav","footer","header","aside"]):node.decompose()
    main=soup.select_one("article") or soup.select_one("main") or soup
    text=clean(main.get_text(" ",strip=True))
    date=parse_date(text[:1600])
    if not date:
        meta=soup.find("meta",attrs={"property":"article:published_time"})
        if meta:date=(meta.get("content") or "")[:10]
    return text[:16000],date

def project_slice(projects):
    # Six 4-hour windows cover every project over 24 hours.
    slot=(datetime.now(timezone.utc).hour//4)%6
    return [p for index,p in enumerate(projects) if index%6==slot]

def index_links(source,projects,mode="normal"):
    soup,base=response_page(source["url"])
    main=soup.select_one("main") or soup
    results={}
    considered=set()
    budget=source["cap"]
    for node in main.select("a[href]"):
        title=clean(node.get_text(" ",strip=True))
        if not 15<=len(title)<=220:continue
        link=normurl(urljoin(base,node.get("href","")))
        if not permitted(link,source["host"]) or link in considered:continue
        considered.add(link)
        path=urlparse(link).path.lower()
        if not any(t in path for t in ARTICLE_HINTS):continue
        nearby=clean((node.parent or node).get_text(" ",strip=True))[:380]
        strong=bool(GENESIS.search(title+" "+nearby))
        registered_title=any(len(p["title"])>24 and p["title"].lower() in (title+" "+nearby).lower() for p in projects)
        if not (strong or registered_title):continue
        try:body,date=article_body(link,source["host"])
        except (requests.RequestException,ValueError):continue
        if not body:continue
        matches=project_ids(body,projects)
        if not GENESIS.search(body[:12000]) and not matches:continue
        snippet=next((clean(p.get_text(" ",strip=True)) for p in BeautifulSoup(body[:5000],"html.parser").find_all("p") if len(clean(p.get_text(" ",strip=True)))>65),"")
        snippet=snippet or body[100:350]
        item=record(title,link,source,date or parse_date(nearby),snippet,matches)
        results[item["id"]]=item
        if len(results)>=budget:break
    return list(results.values())

def collect(channel):
    projects=registered()
    if channel=="doe":selected=[SOURCES[0]]
    elif channel=="labs":selected=[s for s in SOURCES if s["group"]=="Labs"]
    elif channel=="partners":selected=[s for s in SOURCES if s["group"]=="Partners"]
    elif channel=="projects":selected=[s for s in SOURCES if s["group"] in ("Labs","Partners")]
    else:raise ValueError("Unknown channel")
    eligible=project_slice(projects) if channel=="projects" else projects
    successes=0;source_status=[];all_items={}
    for source in selected:
        try:
            found=doe_index(source) if source["group"]=="DOE" else index_links(source,eligible,channel)
            successes+=1
            for r in found:all_items[r["id"]]=r
            source_status.append({"name":source["name"],"group":source["group"],"ok":True,"count":len(found)})
            print(source["name"],len(found),"Genesis-relevant articles")
        except Exception as e:
            source_status.append({"name":source["name"],"group":source["group"],"ok":False,"count":0,"error":str(e)[:140]})
            print(source["name"],"failed",str(e)[:140],file=sys.stderr)
    if channel in ("labs","projects"):
        for group,title,url,name in SEED_ARTICLES:
            if channel=="projects" and not any(p["title"].lower().startswith("foundation models for the electric grid") for p in eligible):continue
            try:
                if not permitted(url,urlparse(url).hostname):continue
                body,date=article_body(url,urlparse(url).hostname)
                if not GENESIS.search(body):continue
                s={"name":name,"group":group}
                r=record(title,url,s,date,body[:280],project_ids(body,projects))
                all_items[r["id"]]=r
            except Exception as e:print("Seed not fetched",url,str(e)[:100],file=sys.stderr)
    if not successes:
        raise ValueError("No first-party source reachable; archive preserved")
    return list(all_items.values()),source_status

def merge(channel,found,source_status):
    old=json.loads(ARCHIVE.read_text(encoding="utf-8")) if ARCHIVE.exists() else {"items":[]}
    records={}
    for d in old.get("items",[]):
        u=d.get("url","")
        if not u.startswith("https://") or urlparse(u).hostname in ("news.google.com","www.google.com"):continue
        records[normurl(u)]=d
    for d in found:
        key=normurl(d["url"])
        previous=records.get(key)
        if previous and previous.get("project_ids") and not d.get("project_ids"):
            d["project_ids"]=previous["project_ids"]
        records[key]=d
    rows=sorted(records.values(),key=lambda x:(x.get("date") or "",x.get("title") or ""),reverse=True)[:4000]
    old_states={x["name"]:x for x in old.get("sources",[])}
    for x in source_status:old_states[x["name"]]=x
    statuses=sorted(old_states.values(),key=lambda x:(x.get("group") or "",x["name"]))
    change_signature=lambda xs:json.dumps(xs,sort_keys=True,ensure_ascii=False)
    # Do not commit/redeploy solely because another scheduled poll ran unchanged.
    if change_signature(rows)==change_signature(old.get("items",[])) and change_signature(statuses)==change_signature(old.get("sources",[])):
        print("Unchanged; no repository update");return False
    doc={"updated_at":datetime.now(timezone.utc).isoformat(),"count":len(rows),
         "method":"Publisher-direct Genesis Mission collection; project links are provisional, partnership claims never public",
         "sources":statuses,"items":rows}
    ARCHIVE.write_text(json.dumps(doc,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print("Stored",len(rows),"archive articles; channel",channel)
    return True

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--channel",choices=["doe","labs","partners","projects"],default="doe")
    args=parser.parse_args()
    discovered,states=collect(args.channel)
    merge(args.channel,discovered,states)
