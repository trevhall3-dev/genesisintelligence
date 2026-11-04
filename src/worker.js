// GIH Build 2: First-party DOE Genesis news via GitHub-scheduled direct collection.
// Public /api/news serves persisted source-linked archive; NO Google News dependencies.
async function shaId(value){const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(buf)].slice(0,12).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function readProjectAsset(env){const request=new Request("https://gih.internal/projects.json");const response=await env.ASSETS.fetch(request);if(!response.ok)return null;const data=await response.json();return Array.isArray(data.projects)&&data.projects.length>=250?data:null}
async function importRegistry(env){if(!env.DB)return{skipped:"D1 database not bound"};const data=await readProjectAsset(env);if(!data)return{skipped:"complete official roster not yet published"};
const statements=[];for(const p of data.projects){statements.push(env.DB.prepare("INSERT INTO projects (id,title,investigator,institution,city,state,postal_code,category,sector,selection_status,selection_date,source_url,source_phase) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,investigator=excluded.investigator,institution=excluded.institution,city=excluded.city,state=excluded.state,category=excluded.category,selection_status=excluded.selection_status,updated_at=CURRENT_TIMESTAMP")
.bind(p.id,p.title,p.principal_investigator,p.institution,p.city,p.state,p.zip,p.category,p.sector,p.selection_status,p.selection_date,p.source_url,p.source_phase));}
for(let i=0;i<statements.length;i+=80)await env.DB.batch(statements.slice(i,i+80));
await env.DB.prepare("INSERT INTO sync_runs (source,last_checked,last_success,imported_count,last_error) VALUES ('DOE RFA roster',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?1,NULL) ON CONFLICT(source) DO UPDATE SET last_checked=CURRENT_TIMESTAMP,last_success=CURRENT_TIMESTAMP,imported_count=?1,last_error=NULL").bind(data.projects.length).run();
return{count:data.projects.length}}
async function archiveNews(env,data){if(!env.DB)return;const statements=[];for(const item of data.items){if(!item.url||!item.title)continue;const id=await shaId(item.url);const group=item.group||"DOE";statements.push(env.DB.prepare("INSERT OR IGNORE INTO news (id,title,summary,source,url,published_at,category,source_group) VALUES (?,?,?,?,?,?,?,?)").bind(id,item.title,item.summary,item.source,item.url,item.date,item.category,group))}
for(let i=0;i<statements.length;i+=70)await env.DB.batch(statements.slice(i,i+70))}
async function directNews(env,request){const url=new URL("/news-archive.json",request.url);const res=await env.ASSETS.fetch(new Request(url));if(!res.ok)throw Error("News archive not published");const data=await res.json();const items=Array.isArray(data.items)?data.items:[];return {items,checkedAt:data.updated_at||"",sources:Array.isArray(data.sources)?data.sources:[{name:"DOE Genesis Mission",ok:items.length>0,count:items.length}],method:data.method||"Direct DOE official Genesis collection",live:items.length>0}}
async function archivedFeed(env){if(!env.DB)return null;const {results}=await env.DB.prepare("SELECT title,summary,source,url,published_at AS date,category,source_group FROM news ORDER BY published_at DESC LIMIT 500").all();return results.map(r=>({...r,kind:"discovery",tier:r.source_group==="DOE"?"Official":"Related"}))}
async function projectJson(env){if(env.DB){try{const result=await env.DB.prepare("SELECT id,title,investigator AS principal_investigator,institution,city,state,postal_code AS zip,category,sector,selection_status,selection_date,source_url,source_phase FROM projects ORDER BY title LIMIT 1500").all();if(result.results.length>=250)return new Response(JSON.stringify({metadata:{count:result.results.length,source:"Cloudflare D1 + DOE RFA roster"},projects:result.results}),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"public,max-age=300"}})}catch(e){/* database may not have been provisioned; static fallback */}}
const data=await readProjectAsset(env);return new Response(JSON.stringify(data||{metadata:{count:0,scope:"Official roster pending import"},projects:[]}),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"public,max-age=300"}})}
export default{
 async scheduled(event,env,ctx){if(!env.DB)return;try{await importRegistry(env);const latest=await directNews(env,new Request("https://gih.internal/api/news"));await archiveNews(env,latest)}catch(e){console.error("Scheduled Genesis collection failed",e)}},
 async fetch(request,env,ctx){const url=new URL(request.url);
  if(url.pathname==="/api/projects")return projectJson(env);
  if(url.pathname==="/api/news"){
   const latest=await directNews(env,request);
   if(env.DB)ctx.waitUntil(archiveNews(env,latest).catch(e=>console.error("archiveNews",e)));
   return new Response(JSON.stringify({...latest,archiveEnabled:!!env.DB}),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=120, s-maxage=300"}});
  }
  return env.ASSETS.fetch(request)
 }
};
