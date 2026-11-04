// Genesis Intelligence Build 2 — public-news discovery endpoint.
// No AI API keys, database, or paid services are required.
// News discovery uses Google News RSS searches restricted to DOE/laboratory domains.
// These are discovery results, not independently verified DOE announcements.
const feeds=[
 {name:"DOE Genesis",tier:"Official",url:"https://news.google.com/rss/search?q=site%3Aenergy.gov+%22Genesis+Mission%22+when%3A90d&hl=en-US&gl=US&ceid=US%3Aen"},
 {name:"Laboratory Genesis",tier:"Related",url:"https://news.google.com/rss/search?q=%22Genesis+Mission%22+(site%3Aornl.gov+OR+site%3Aanl.gov+OR+site%3Alanl.gov+OR+site%3Abnl.gov+OR+site%3Apnnl.gov+OR+site%3Allnl.gov+OR+site%3Albl.gov+OR+site%3Asandia.gov)+when%3A90d&hl=en-US&gl=US&ceid=US%3Aen"},
 {name:"Genesis partners",tier:"Related",url:"https://news.google.com/rss/search?q=%22Genesis+Mission%22+(university+OR+partner+OR+industry)+when%3A90d&hl=en-US&gl=US&ceid=US%3Aen"}
];
function decode(s){return (s||"").replace(/<!\[CDATA\[|\]\]>/g,"").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/<[^>]*>/g,"").trim()}
function tag(s,n){const m=s.match(new RegExp("<"+n+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+n+">","i"));return m?decode(m[1]):""}
function category(s){s=s.toLowerCase();if(/model|machine learning|artificial intelligence|software|ai4|agent/.test(s))return"AI models";if(/data|dataset|digital/.test(s))return"Data";if(/supercomput|facility|infrastructure|grid|platform/.test(s))return"Infrastructure";if(/partner|consortium|industry|public.private/.test(s))return"Partnerships";return"National challenges"}
async function collect(feed){try{const res=await fetch(feed.url,{headers:{"User-Agent":"GenesisIntelligence/2.0 (+public research dashboard)"},signal:AbortSignal.timeout(9000)});if(!res.ok)throw new Error("status "+res.status);const xml=await res.text();if(!/<rss|<feed/i.test(xml))throw new Error("not rss");const chunks=xml.match(/<item\b[\s\S]*?<\/item>/gi)||[];const rows=chunks.slice(0,25).map(s=>{const title=tag(s,"title").replace(/\s+-\s+[^-]+$/,"");const source=tag(s,"source")||feed.name;const link=tag(s,"link");const date=tag(s,"pubDate");const excerpt=tag(s,"description").replace(/\s+/g," ").slice(0,250);return{title,source,url:link,date:date&&Number.isFinite(Date.parse(date))?new Date(date).toISOString():"",summary:excerpt||"Open the linked source for full details.",tier:feed.tier,category:category(title+" "+excerpt),kind:"discovery"}}).filter(x=>x.title&&/^https:\/\//.test(x.url));return{items:rows,ok:true}}catch(e){return{items:[],ok:false,error:String(e.message).slice(0,100)}}}
async function news(){const all=await Promise.all(feeds.map(collect));const seen=new Set();const items=all.flatMap(x=>x.items).filter(x=>{const k=x.title.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,90);if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>(b.date||"").localeCompare(a.date||""));return{items,checkedAt:new Date().toISOString(),sources:feeds.map((f,i)=>({name:f.name,ok:all[i].ok,count:all[i].items.length,error:all[i].error||null})),method:"News discovery via Google News RSS searches limited to DOE/laboratory domains; all items require original-source verification.",live:all.some(x=>x.ok)}}

async function shaId(value){const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(buf)].slice(0,12).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function readProjectAsset(env){const request=new Request("https://gih.internal/projects.json");const response=await env.ASSETS.fetch(request);if(!response.ok)return null;const data=await response.json();return Array.isArray(data.projects)&&data.projects.length>=250?data:null}
async function importRegistry(env){if(!env.DB)return{skipped:"D1 database not bound"};const data=await readProjectAsset(env);if(!data)return{skipped:"complete official roster not yet published"};
const statements=[];for(const p of data.projects){statements.push(env.DB.prepare("INSERT INTO projects (id,title,investigator,institution,city,state,postal_code,category,sector,selection_status,selection_date,source_url,source_phase) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,investigator=excluded.investigator,institution=excluded.institution,city=excluded.city,state=excluded.state,category=excluded.category,selection_status=excluded.selection_status,updated_at=CURRENT_TIMESTAMP")
.bind(p.id,p.title,p.principal_investigator,p.institution,p.city,p.state,p.zip,p.category,p.sector,p.selection_status,p.selection_date,p.source_url,p.source_phase));}
for(let i=0;i<statements.length;i+=80)await env.DB.batch(statements.slice(i,i+80));
await env.DB.prepare("INSERT INTO sync_runs (source,last_checked,last_success,imported_count,last_error) VALUES ('DOE RFA roster',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?1,NULL) ON CONFLICT(source) DO UPDATE SET last_checked=CURRENT_TIMESTAMP,last_success=CURRENT_TIMESTAMP,imported_count=?1,last_error=NULL").bind(data.projects.length).run();
return{count:data.projects.length}}
async function archiveNews(env,data){if(!env.DB)return;const statements=[];for(const item of data.items){if(!item.url||!item.title)continue;const id=await shaId(item.url);const group=item.tier==="Official"?"DOE":item.tier==="Related"?"Labs":"Partners";statements.push(env.DB.prepare("INSERT OR IGNORE INTO news (id,title,summary,source,url,published_at,category,source_group) VALUES (?,?,?,?,?,?,?,?)").bind(id,item.title,item.summary,item.source,item.url,item.date,item.category,group))}
for(let i=0;i<statements.length;i+=70)await env.DB.batch(statements.slice(i,i+70))}
async function archivedFeed(env){if(!env.DB)return null;const {results}=await env.DB.prepare("SELECT title,summary,source,url,published_at AS date,category,source_group FROM news ORDER BY published_at DESC LIMIT 500").all();return results.map(r=>({...r,kind:"discovery",tier:r.source_group==="DOE"?"Official":"Related"}))}
async function projectJson(env){if(env.DB){try{const result=await env.DB.prepare("SELECT id,title,investigator AS principal_investigator,institution,city,state,postal_code AS zip,category,sector,selection_status,selection_date,source_url,source_phase FROM projects ORDER BY title LIMIT 1500").all();if(result.results.length>=250)return new Response(JSON.stringify({metadata:{count:result.results.length,source:"Cloudflare D1 + DOE RFA roster"},projects:result.results}),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"public,max-age=300"}})}catch(e){/* database may not have been provisioned; static fallback */}}
const data=await readProjectAsset(env);return new Response(JSON.stringify(data||{metadata:{count:0,scope:"Official roster pending import"},projects:[]}),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"public,max-age=300"}})}
export default{
 async scheduled(event,env,ctx){if(!env.DB)return;try{await importRegistry(env);const latest=await news();await archiveNews(env,latest)}catch(e){console.error("Scheduled Genesis collection failed",e)}},
 async fetch(request,env,ctx){const url=new URL(request.url);
  if(url.pathname==="/api/projects")return projectJson(env);
  if(url.pathname==="/api/news"){const cache=caches.default;const key=new Request(url.origin+"/api/news");if(!url.searchParams.has("refresh")){const hit=await cache.match(key);if(hit)return hit}
   const live=await news();if(env.DB)ctx.waitUntil(archiveNews(env,live).catch(e=>console.error("archiveNews",e)));
   const archived=await archivedFeed(env).catch(()=>null);
   const merged=archived?.length?[...live.items,...archived.filter(x=>!live.items.some(y=>y.url===x.url))]:live.items;
   const response=new Response(JSON.stringify({...live,items:merged,archiveEnabled:!!env.DB}),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=0, s-maxage=1800"}});
   if(!url.searchParams.has("refresh"))ctx.waitUntil(cache.put(key,response.clone()));return response;
  }
  return env.ASSETS.fetch(request)
 }
};
