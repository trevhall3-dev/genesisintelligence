import {visitorEvent,visitorAdmin,visitorCleanup} from "./visitor-intelligence.js";
// Genesis Intelligence Hub Build 2.1 — public-source data, private intelligence.
// All public APIs return only projects, news and non-sensitive health metadata.
// Partner candidates and their evidence remain exclusively in the D1 database.
const JSON_HEADERS={"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=120"};
function respond(v,status=200){return new Response(JSON.stringify(v),{status,headers:JSON_HEADERS})}
async function digest(s){const data=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(s)));return Array.from(new Uint8Array(data)).map(b=>b.toString(16).padStart(2,"0")).join("")}
async function asset(env,path){const r=await env.ASSETS.fetch(new Request("https://gih-assets.internal/"+path));if(!r.ok)throw Error("Asset not published: "+path+" ("+r.status+")");return r.json()}
function tagsFor(p,policy){
 const tags=policy.rules.filter(([,pattern])=>new RegExp(pattern,"i").test(p.title||"")).map(([name])=>name);
 if(/\b(ai|ml|models?|learning|agentic|neural|digital twin|artificial intelligence)\b/i.test(p.title||""))tags.push("AI models");
 return tags.length?tags:[policy.default];
}
async function classifiedRoster(env){
 const [doc,policy]=await Promise.all([asset(env,"projects.json"),asset(env,"project-classification.json")]);
 return {...doc,metadata:{...doc.metadata,classification_version:policy.version},projects:doc.projects.map(p=>{const categories=tagsFor(p,policy);return {...p,category:categories[0],categories}})};
}
const MIGRATIONS=[
 "CREATE TABLE IF NOT EXISTS national_challenges(id TEXT PRIMARY KEY,title TEXT NOT NULL,challenge_group TEXT NOT NULL,source_url TEXT NOT NULL,verified_at TEXT NOT NULL)",
 "CREATE TABLE IF NOT EXISTS source_versions(source TEXT PRIMARY KEY,content_hash TEXT NOT NULL,imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,item_count INTEGER NOT NULL DEFAULT 0)",
 "CREATE TABLE IF NOT EXISTS organizations(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE,organization_type TEXT,website TEXT,first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
 "CREATE TABLE IF NOT EXISTS project_tags(project_id TEXT NOT NULL,tag TEXT NOT NULL,basis TEXT NOT NULL DEFAULT 'provisional-title-classification',PRIMARY KEY(project_id,tag))",
 "CREATE TABLE IF NOT EXISTS private_partner_candidates(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,organization_id TEXT NOT NULL,reported_role TEXT NOT NULL DEFAULT 'potential collaborator',status TEXT NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate','corroborated','verified','rejected')),publication_status TEXT NOT NULL DEFAULT 'private' CHECK(publication_status IN ('private','approved')),evidence_url TEXT NOT NULL,evidence_excerpt TEXT,detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT,reviewer_note TEXT,UNIQUE(project_id,organization_id,evidence_url))",
 "CREATE INDEX IF NOT EXISTS idx_partner_review ON private_partner_candidates(status,publication_status)",
 "CREATE INDEX IF NOT EXISTS idx_partner_project ON private_partner_candidates(project_id)",
 "CREATE TABLE IF NOT EXISTS collector_events(id INTEGER PRIMARY KEY AUTOINCREMENT,source TEXT NOT NULL,checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,status TEXT NOT NULL CHECK(status IN ('ok','warning','error')),total_seen INTEGER NOT NULL DEFAULT 0,added INTEGER NOT NULL DEFAULT 0,message TEXT)",
 "CREATE INDEX IF NOT EXISTS idx_collector_events_date ON collector_events(checked_at DESC)"
];
async function migrate(db){for(const sql of MIGRATIONS)await db.prepare(sql).run()}
async function previousHash(db,name){const row=await db.prepare("SELECT content_hash FROM source_versions WHERE source=?").bind(name).first();return row?.content_hash||""}
async function markVersion(db,name,hash,count){await db.prepare("INSERT INTO source_versions(source,content_hash,item_count,imported_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(source) DO UPDATE SET content_hash=excluded.content_hash,item_count=excluded.item_count,imported_at=CURRENT_TIMESTAMP").bind(name,hash,count).run()}
async function recordEvent(db,source,status,total,added,message=""){await db.prepare("INSERT INTO collector_events(source,status,total_seen,added,message) VALUES(?,?,?,?,?)").bind(source,status,total,added,message.slice(0,350)).run()}
async function sendBatches(db,stmts,size=35){for(let i=0;i<stmts.length;i+=size)await db.batch(stmts.slice(i,i+size))}
async function syncProjects(env){
 const db=env.DB,doc=await classifiedRoster(env);
 if(!Array.isArray(doc.projects)||doc.projects.length<290)throw Error("Project roster incomplete; import skipped");
 const hash=await digest(JSON.stringify(doc.projects));
 if(hash===await previousHash(db,"projects"))return {changed:false,count:doc.projects.length};
 const stmts=[],tags=[];
 for(const p of doc.projects){
  if(!p.id||!p.title||!p.institution||!p.source_url)continue;
  stmts.push(db.prepare("INSERT INTO projects(id,title,investigator,institution,city,state,postal_code,category,sector,selection_status,selection_date,source_url,source_phase) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,investigator=excluded.investigator,institution=excluded.institution,city=excluded.city,state=excluded.state,category=excluded.category,sector=excluded.sector,selection_status=excluded.selection_status,selection_date=excluded.selection_date,source_url=excluded.source_url,source_phase=excluded.source_phase,updated_at=CURRENT_TIMESTAMP").bind(p.id,p.title,p.principal_investigator||"",p.institution,p.city||"",p.state||"",p.zip||"",p.category||"AI models",p.sector||"Partners",p.selection_status||"Selection — funding not independently confirmed",p.selection_date||"",p.source_url,p.source_phase||"DOE public selection"));
  tags.push(db.prepare("DELETE FROM project_tags WHERE project_id=?").bind(p.id));
  for(const t of p.categories)tags.push(db.prepare("INSERT OR IGNORE INTO project_tags(project_id,tag,basis) VALUES(?,?,'provisional-title-classification')").bind(p.id,t));
 }
 await sendBatches(db,stmts);
 await sendBatches(db,tags);
 await markVersion(db,"projects",hash,stmts.length);
 await db.prepare("INSERT INTO sync_runs(source,last_checked,last_success,imported_count,last_error) VALUES('DOE RFA roster',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,NULL) ON CONFLICT(source) DO UPDATE SET last_checked=CURRENT_TIMESTAMP,last_success=CURRENT_TIMESTAMP,imported_count=excluded.imported_count,last_error=NULL").bind(stmts.length).run();
 await recordEvent(db,"projects","ok",doc.projects.length,stmts.length,"Reconciled official project roster");
 return {changed:true,count:stmts.length};
}
async function archivedDocument(env){
 const doc=await asset(env,"news-archive.json");
 return {items:Array.isArray(doc.items)?doc.items.filter(d=>d.title&&/^https:\/\//.test(d.url||"")):[],
         sources:Array.isArray(doc.sources)?doc.sources:[],checkedAt:doc.updated_at||null,method:doc.method||"First-party public-source discovery"};
}
async function syncNews(env){
 const db=env.DB,doc=await archivedDocument(env),hash=await digest(JSON.stringify(doc.items));
 if(hash===await previousHash(db,"news"))return {changed:false,count:doc.items.length};
 const inserts=[];
 for(const item of doc.items){
  const id=await digest(item.url);const group=["DOE","Labs","Partners"].includes(item.group)?item.group:"Partners";
  inserts.push(db.prepare("INSERT INTO news(id,title,summary,source,url,published_at,category,source_group) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET title=excluded.title,summary=excluded.summary,source=excluded.source,published_at=excluded.published_at,category=excluded.category,source_group=excluded.source_group").bind(id,item.title,String(item.summary||"").slice(0,480),item.source||group,item.url,item.date||"",item.category||"National challenges",group));
 }
 await sendBatches(db,inserts);
 // Preserve project identities found within official publisher article bodies by the
 // rotating project watchlist collector. These are provisional article links only.
 const knownIds=new Set((await db.prepare("SELECT id FROM projects LIMIT 1400").all()).results.map(x=>x.id));
 const newsIdByUrl=new Map((await db.prepare("SELECT id,url FROM news ORDER BY discovered_at DESC LIMIT 5000").all()).results.map(x=>[x.url,x.id]));
 const hints=[];
 for(const article of doc.items){
  const articleId=newsIdByUrl.get(article.url);
  if(!articleId||!Array.isArray(article.project_ids))continue;
  for(const projectId of article.project_ids.slice(0,8)){
   if(!knownIds.has(projectId))continue;
   hints.push(db.prepare("INSERT OR IGNORE INTO project_news(project_id,news_id,match_method) VALUES(?,?,'publisher-page-project-match')").bind(projectId,articleId));
  }
 }
 await sendBatches(db,hints);
 await markVersion(db,"news",hash,doc.items.length);
 await db.prepare("INSERT INTO sync_runs(source,last_checked,last_success,imported_count,last_error) VALUES('News archive',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,NULL) ON CONFLICT(source) DO UPDATE SET last_checked=CURRENT_TIMESTAMP,last_success=CURRENT_TIMESTAMP,imported_count=excluded.imported_count,last_error=NULL").bind(doc.items.length).run();
 await recordEvent(db,"news","ok",doc.items.length,inserts.length,"Imported first-party news archive");
 return {changed:true,count:inserts.length};
}
function projectAssociation(d,p){
 const title=String(p.title||"").toLowerCase(),text=(String(d.title||"")+" "+String(d.summary||"")).toLowerCase();
 if(title.length>=22&&text.includes(title))return "exact-title";
 // Acronyms only count with the Genesis context, to prevent unrelated matches.
 const aliases=(String(p.title||"").match(/\b[A-Z][A-Z0-9-]{3,}\b/g)||[]).filter(x=>!["GENESIS","MISSION","DATA","SCIENCE","ENERGY","MODEL","PROJECT","PHASE"].includes(x));
 return /\bgenesis\b/i.test(text)&&aliases.some(a=>new RegExp("\\b"+a.replace(/[-/\\^$*+?.()|[\]{}]/g,"\\$&")+"\\b","i").test(text))?"acronym-genesis":null;
}
function extractOrganizationNames(text){
 const names=new Set();
 const patterns=[
  /\bUniversity of [A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,4}\b/g,
  /\b[A-Z][A-Za-z.-]+(?:\s+[A-Z][A-Za-z.-]+){0,4}\s(?:National Laboratory|National Laboratories|University|Research Institute|Institute of Technology|Technologies|Corporation|Systems)\b/g,
  /\b(?:IBM|NVIDIA|Microsoft|Cadence|Amazon Web Services|Stony Brook University|Stanford University|Commonwealth Fusion Systems|MIT|Oak Ridge National Laboratory|Argonne National Laboratory|Brookhaven National Laboratory|Pacific Northwest National Laboratory)\b/g
 ];
 for(const regex of patterns)for(const match of String(text||"").matchAll(regex)){
  const name=match[0].trim().slice(0,110);
  if(name.length>=3&&!/^(Genesis Mission|Department of Energy|DOE)$/i.test(name))names.add(name);
 }
 return [...names].slice(0,35);
}
async function linkProjectsAndCandidates(env){
 const db=env.DB;
 const projects=(await db.prepare("SELECT id,title,institution FROM projects LIMIT 1200").all()).results||[];
 const news=(await db.prepare("SELECT id,title,summary,url,source FROM news ORDER BY discovered_at DESC LIMIT 400").all()).results||[];
 const hinted=(await db.prepare("SELECT project_id,news_id FROM project_news LIMIT 8000").all()).results||[];
 const hintedByNews=new Map();
 for(const hint of hinted){if(!hintedByNews.has(hint.news_id))hintedByNews.set(hint.news_id,new Set());hintedByNews.get(hint.news_id).add(hint.project_id)}
 if(!projects.length||!news.length)return {links:0,candidates:0};
 const linked=[],candidates=[],organizations=new Map();
 // Candidate evidence is deliberately conservative: project identity + collaboration term + named second institution.
 const candidatesByOrg=projects.filter(p=>p.institution&&p.institution.length>9);
 let checked=0;
 for(const d of news){
  const matched=projects.filter(p=>hintedByNews.get(d.id)?.has(p.id)||projectAssociation(d,p)).slice(0,4);
  if(!matched.length)continue;
  const content=(d.title+" "+(d.summary||""));const collab=/\b(collaborat(?:ion|or|e|ing)|partner(?:ship|ed|s)?|jointly|in partnership with|working with)\b/i.test(content);
  for(const p of matched){
   const method=hintedByNews.get(d.id)?.has(p.id)?"publisher-page-project-match":projectAssociation(d,p);
   linked.push(db.prepare("INSERT OR IGNORE INTO project_news(project_id,news_id,match_method) VALUES(?,?,?)").bind(p.id,d.id,method));
   if(!collab)continue;
   const actorNames=new Set([...candidatesByOrg.map(x=>x.institution),...extractOrganizationNames(content)]);
   for(const name of actorNames){
    if(name.toLowerCase()===String(p.institution||"").toLowerCase())continue;
    const idx=content.toLowerCase().indexOf(name.toLowerCase());
    if(idx<0)continue;
    const context=content.slice(Math.max(0,idx-110),Math.min(content.length,idx+name.length+110));
    if(!/\b(collaborat|partner|jointly|working with)\b/i.test(context))continue;
    const orgId=(await digest(name.toLowerCase())).slice(0,24);
    const id=(await digest(p.id+"|"+orgId+"|"+d.url)).slice(0,24);
    organizations.set(orgId,name);
    candidates.push({id,project_id:p.id,org_id:orgId,url:d.url,excerpt:context.slice(0,320)});
    if(candidates.length>=120)break;
   }
  }
  if(++checked>=160||candidates.length>=120)break;
 }
 await sendBatches(db,linked);
 const orgStmts=[...organizations.entries()].map(([id,name])=>db.prepare("INSERT OR IGNORE INTO organizations(id,name,organization_type) VALUES(?,?,'institution')").bind(id,name));
 await sendBatches(db,orgStmts);
 const candidateStmts=candidates.map(c=>db.prepare("INSERT OR IGNORE INTO private_partner_candidates(id,project_id,organization_id,evidence_url,evidence_excerpt,status,publication_status) VALUES(?,?,?,?,?,'candidate','private')").bind(c.id,c.project_id,c.org_id,c.url,c.excerpt));
 await sendBatches(db,candidateStmts);
 return {links:linked.length,candidates:candidateStmts.length};
}
async function synchronize(env){
 if(!env.DB)return {ok:false,reason:"D1 binding missing"};
 const db=env.DB;await migrate(db);
 const catalog=await asset(env,"challenges.json");
 if(catalog.challenges.length!==33)throw Error("Official challenge catalog incomplete");
 const challengeHash=await digest(JSON.stringify(catalog.challenges));
 if(challengeHash!==await previousHash(db,"national-challenges")){
  await sendBatches(db,catalog.challenges.map(c=>db.prepare("INSERT INTO national_challenges(id,title,challenge_group,source_url,verified_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,challenge_group=excluded.challenge_group,source_url=excluded.source_url,verified_at=excluded.verified_at").bind(c.id,c.title,c.group,c.source_url,catalog.metadata.verified_at)));
  await markVersion(db,"national-challenges",challengeHash,catalog.challenges.length);
 }
 const projects=await syncProjects(env);
 const news=await syncNews(env);
 const connections=await linkProjectsAndCandidates(env);
 console.log("GIH D1 synchronization",JSON.stringify({projects,news,connections}));
 return {ok:true,projects,news,connections};
}
async function apiProjects(env,ctx){
 if(!env.DB)return respond(await classifiedRoster(env));
 try{
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM projects").first();
  if((count?.n||0)<250)ctx.waitUntil(synchronize(env).catch(e=>console.error("GIH D1 bootstrap",e)));
  else{
   const records=(await env.DB.prepare("SELECT id,title,investigator AS principal_investigator,institution,city,state,postal_code AS zip,category,sector,selection_status,selection_date,source_url,source_phase FROM projects ORDER BY title LIMIT 1400").all()).results;
   const policy=await asset(env,"project-classification.json");
   // Recompute on read so stale D1 tags cannot leak before the scheduled sync.
   return respond({metadata:{count:records.length,source:"Cloudflare D1",classification:policy.note},projects:records.map(p=>{const categories=tagsFor(p,policy);return {...p,category:categories[0],categories}})});
  }
 }catch(e){console.error("Project API database fallback",e);ctx.waitUntil(synchronize(env).catch(x=>console.error("GIH D1 seed",x)))}
 // Never hide public project records because the D1 import is still running.
 return respond(await classifiedRoster(env));
}
async function apiNews(env,ctx){
 const fallback=await archivedDocument(env);
 if(!env.DB)return respond({...fallback,archiveEnabled:false});
 try{
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM news").first();
  if((count?.n||0)<1)ctx.waitUntil(synchronize(env).catch(e=>console.error("GIH D1 bootstrap",e)));
  const rows=(await env.DB.prepare("SELECT title,summary,source,url,published_at AS date,category,source_group AS 'group' FROM news ORDER BY published_at DESC LIMIT 1000").all()).results;
  const seen=new Set();
  const merged=[...fallback.items,...rows].filter(i=>{if(seen.has(i.url))return false;seen.add(i.url);return true}).sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
  return respond({...fallback,items:merged,archiveEnabled:true});
 }catch(e){console.error("News API database fallback",e);ctx.waitUntil(synchronize(env).catch(x=>console.error("GIH D1 seed",x)));return respond({...fallback,archiveEnabled:false})}
}
async function apiHealth(env){
 const base={databaseBound:!!env.DB,version:"2.1",partnershipsPublic:false};
 if(!env.DB)return respond({...base,status:"database-not-bound",sources:(await archivedDocument(env)).sources});
 try{
  const [p,n,events]=await Promise.all([
   env.DB.prepare("SELECT COUNT(*) AS n FROM projects").first(),
   env.DB.prepare("SELECT COUNT(*) AS n FROM news").first(),
   env.DB.prepare("SELECT source,checked_at,status,total_seen,added,message FROM collector_events ORDER BY id DESC LIMIT 8").all()
  ]);
  const doc=await archivedDocument(env);
  return respond({...base,status:p.n>=290?"synced":"pending-initial-import",projects:p.n,articles:n.n,archiveUpdatedAt:doc.checkedAt,sources:doc.sources,recentSyncs:events.results});
 }catch(e){return respond({...base,status:"database-error",error:"Health query failed; inspect Worker logs"},503)}
}
export default{
 async scheduled(controller,env,ctx){
  console.log("GIH hourly scheduled sync",controller.cron);
  if(!env.DB){console.error("DB binding missing");return}
  try{await visitorCleanup(env)}catch(e){console.error("Visitor retention failed",e)}
  try{await synchronize(env)}catch(e){console.error("GIH scheduled sync failed",e);try{await recordEvent(env.DB,"hourly-sync","error",0,0,String(e))}catch{}}
 },
 async fetch(request,env,ctx){
  const path=new URL(request.url).pathname;
  if(path==="/api/visitor-event")return visitorEvent(request,env);
  if(path==="/api/admin/visitor-intelligence")return visitorAdmin(request,env);
  if(path==="/api/projects")return apiProjects(env,ctx);
  if(path==="/api/news")return apiNews(env,ctx);
  if(path==="/api/health")return apiHealth(env);
  // No private partnership API. Review only using authenticated Cloudflare D1 Console.
  if(path.startsWith("/api/"))return respond({error:"Unknown endpoint"},404);
  return env.ASSETS.fetch(request);
 }
};
