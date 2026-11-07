// Privacy-preserving visitor intelligence. All admin access requires verified Cloudflare Access JWT.
const TYPES=new Set(["page_view","search","project_open","article_open","briefing_open","section_view","source_open"]);
const DDL=[
"CREATE TABLE IF NOT EXISTS visitor_sessions(session_id TEXT PRIMARY KEY,first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,country TEXT,region TEXT,city TEXT,asn INTEGER,network_name TEXT,device_type TEXT,browser_family TEXT,os_family TEXT,referrer_host TEXT,landing_path TEXT,pageviews INTEGER NOT NULL DEFAULT 0,events INTEGER NOT NULL DEFAULT 0)",
"CREATE INDEX IF NOT EXISTS idx_vi_session_date ON visitor_sessions(first_seen_at)",
"CREATE INDEX IF NOT EXISTS idx_vi_session_asn ON visitor_sessions(asn,first_seen_at)",
"CREATE TABLE IF NOT EXISTS visitor_events(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,event_type TEXT NOT NULL CHECK(event_type IN ('page_view','search','project_open','article_open','briefing_open','section_view','source_open')),path TEXT,section TEXT,record_id TEXT,search_result_count INTEGER,FOREIGN KEY(session_id) REFERENCES visitor_sessions(session_id))",
"CREATE INDEX IF NOT EXISTS idx_vi_events_date ON visitor_events(event_at)",
"CREATE INDEX IF NOT EXISTS idx_vi_events_type_date ON visitor_events(event_type,event_at)",
"CREATE INDEX IF NOT EXISTS idx_vi_events_session ON visitor_events(session_id,event_at)"
];
let ready;
async function init(db){if(!ready)ready=(async()=>{for(const sql of DDL)await db.prepare(sql).run()})().catch(e=>{ready=null;throw e});return ready}
function json(v,status=200){return new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}})}
function originOk(req){const origin=req.headers.get("origin");return origin===new URL(req.url).origin}
function clean(v,n=90){return typeof v==="string"?v.replace(/[<>\x00-\x1f]/g,"").slice(0,n):""}
function pathOnly(v){const p=clean(v,180);return p.startsWith("/")&&!p.startsWith("//")&&!p.includes("?")&&!p.includes("#")?p:"/"}
function family(ua,kind){if(kind==="device")return /bot|crawler|spider/i.test(ua)?"bot":/ipad|tablet/i.test(ua)?"tablet":/mobile|iphone|android/i.test(ua)?"mobile":"desktop";if(kind==="browser")return /Edg\//.test(ua)?"Edge":/Firefox\//.test(ua)?"Firefox":/Chrome\//.test(ua)?"Chrome":/Safari\//.test(ua)?"Safari":"Other";return /Windows/i.test(ua)?"Windows":/iPhone|iPad|iOS/i.test(ua)?"iOS":/Android/i.test(ua)?"Android":/Mac OS/i.test(ua)?"macOS":/Linux/i.test(ua)?"Linux":"Other"}
function host(v){try{const u=new URL(v);return /^https?:$/.test(u.protocol)?u.hostname.slice(0,120):""}catch{return""}}
export async function visitorEvent(req,env){
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 if(!env.DB)return json({error:"Unavailable"},503);
 if(!originOk(req)||req.headers.get("sec-fetch-site")==="cross-site")return json({error:"Forbidden"},403);
 if(!(req.headers.get("content-type")||"").startsWith("application/json"))return json({error:"Content type"},415);
 if(Number(req.headers.get("content-length")||0)>2048)return json({error:"Too large"},413);
 let data;try{const body=await req.text();if(body.length>2048)return json({error:"Too large"},413);data=JSON.parse(body)}catch{return json({error:"Invalid JSON"},400)}
 if(!data||!TYPES.has(data.type)||typeof data.session!=="string"||!/^[a-f0-9-]{36}$/.test(data.session))return json({error:"Invalid event"},400);
 const ua=req.headers.get("user-agent")||"";if(family(ua,"device")==="bot")return new Response(null,{status:204});
 const cf=req.cf||{};const section=clean(data.section,50),record=clean(data.record,100),path=pathOnly(data.path);
 const count=Number.isInteger(data.results)&&data.results>=0&&data.results<=100000?data.results:null;
 try{
 await init(env.DB);
 const s=env.DB.prepare("INSERT INTO visitor_sessions(session_id,country,region,city,asn,network_name,device_type,browser_family,os_family,referrer_host,landing_path,pageviews,events) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,0) ON CONFLICT(session_id) DO NOTHING").bind(data.session,clean(cf.country,2),clean(cf.region,80),clean(cf.city,80),Number(cf.asn)||null,clean(cf.asOrganization,120),family(ua,"device"),family(ua,"browser"),family(ua,"os"),host(data.referrer),path);
 const e=env.DB.prepare("INSERT INTO visitor_events(session_id,event_type,path,section,record_id,search_result_count) VALUES(?,?,?,?,?,?)").bind(data.session,data.type,path,section,record,count);
 const u=env.DB.prepare("UPDATE visitor_sessions SET last_seen_at=CURRENT_TIMESTAMP,pageviews=pageviews+?,events=events+1 WHERE session_id=?").bind(data.type==="page_view"?1:0,data.session);
 await env.DB.batch([s,e,u]);
 return new Response(null,{status:204,headers:{"cache-control":"no-store"}});
 }catch(err){console.error("Visitor event write failed",err);return json({error:"Temporarily unavailable"},503)}
}
function b64(s){return Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(s.length/4)*4,"=")),c=>c.charCodeAt(0))}
async function accessAuthorized(req,env){
 if(!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD)return false;
 const token=req.headers.get("cf-access-jwt-assertion");if(!token)return false;
 const parts=token.split(".");if(parts.length!==3)return false;
 try{
 const header=JSON.parse(new TextDecoder().decode(b64(parts[0]))),payload=JSON.parse(new TextDecoder().decode(b64(parts[1])));
 const domain=env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//,"").replace(/\/$/,"");
 if(!/^[a-z0-9.-]+\.cloudflareaccess\.com$/i.test(domain)||header.alg!=="RS256"||!header.kid)return false;
 const now=Math.floor(Date.now()/1000);
 if(payload.iss!=="https://"+domain||!Array.isArray(payload.aud)||!payload.aud.includes(env.ACCESS_AUD)||payload.exp<=now||payload.nbf>now)return false;
 const res=await fetch("https://"+domain+"/cdn-cgi/access/certs");if(!res.ok)return false;
 const keys=(await res.json()).keys||[];const jwk=keys.find(k=>k.kid===header.kid);if(!jwk)return false;
 const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
 return crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,b64(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
 }catch{return false}
}
export async function visitorAdmin(req,env){
 if(!(await accessAuthorized(req,env)))return json({error:"Unauthorized; configure Cloudflare Access"},403);
 if(!env.DB)return json({error:"Database unavailable"},503);
 try{
 await init(env.DB);
 const [summary,events,countries,networks,sections]=await Promise.all([
 env.DB.prepare("SELECT COUNT(*) sessions,COALESCE(SUM(pageviews),0) pageviews,COALESCE(SUM(events),0) events FROM visitor_sessions WHERE first_seen_at>=datetime('now','-30 days')").first(),
 env.DB.prepare("SELECT event_type,COUNT(*) total FROM visitor_events WHERE event_at>=datetime('now','-30 days') GROUP BY event_type ORDER BY total DESC").all(),
 env.DB.prepare("SELECT country,COUNT(*) total FROM visitor_sessions WHERE first_seen_at>=datetime('now','-30 days') GROUP BY country ORDER BY total DESC LIMIT 20").all(),
 env.DB.prepare("SELECT asn,network_name,COUNT(*) total FROM visitor_sessions WHERE first_seen_at>=datetime('now','-30 days') GROUP BY asn,network_name ORDER BY total DESC LIMIT 20").all(),
 env.DB.prepare("SELECT section,COUNT(*) total FROM visitor_events WHERE event_at>=datetime('now','-30 days') AND section!='' GROUP BY section ORDER BY total DESC LIMIT 20").all()
 ]);
 return json({period:"last 30 days",summary,events:events.results,countries:countries.results,networks:networks.results,sections:sections.results});
 }catch(err){console.error("Visitor admin read failed",err);return json({error:"Analytics unavailable"},503)}
}
export async function visitorCleanup(env){
 if(!env.DB)return;
 await init(env.DB);
 await env.DB.batch([
 env.DB.prepare("DELETE FROM visitor_events WHERE event_at<datetime('now','-90 days')"),
 env.DB.prepare("DELETE FROM visitor_sessions WHERE last_seen_at<datetime('now','-90 days')")
 ]);
}
