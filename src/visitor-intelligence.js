// Privacy-preserving visitor intelligence. All admin access requires verified Cloudflare Access JWT.
const TYPES=new Set(["page_view","search","project_open","article_open","briefing_open","section_view","source_open"]);
const DDL=[
"CREATE TABLE IF NOT EXISTS visitor_sessions(session_id TEXT PRIMARY KEY,first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,country TEXT,region TEXT,city TEXT,asn INTEGER,network_name TEXT,device_type TEXT,browser_family TEXT,os_family TEXT,referrer_host TEXT,landing_path TEXT,pageviews INTEGER NOT NULL DEFAULT 0,events INTEGER NOT NULL DEFAULT 0)",
"CREATE INDEX IF NOT EXISTS idx_vi_session_date ON visitor_sessions(first_seen_at)",
"CREATE INDEX IF NOT EXISTS idx_vi_session_asn ON visitor_sessions(asn,first_seen_at)",
"CREATE TABLE IF NOT EXISTS visitor_events(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,event_type TEXT NOT NULL CHECK(event_type IN ('page_view','search','project_open','article_open','briefing_open','section_view','source_open')),path TEXT,section TEXT,record_id TEXT,search_result_count INTEGER,FOREIGN KEY(session_id) REFERENCES visitor_sessions(session_id))",
"CREATE INDEX IF NOT EXISTS idx_vi_events_date ON visitor_events(event_at)",
"CREATE INDEX IF NOT EXISTS idx_vi_events_type_date ON visitor_events(event_type,event_at)",
"CREATE INDEX IF NOT EXISTS idx_vi_events_session ON visitor_events(session_id,event_at)",
"CREATE TABLE IF NOT EXISTS visitor_ip_observations(session_id TEXT NOT NULL,ip_address TEXT NOT NULL,first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,country TEXT,region TEXT,city TEXT,asn INTEGER,network_name TEXT,device_type TEXT,browser_family TEXT,referrer_host TEXT,last_path TEXT,event_count INTEGER NOT NULL DEFAULT 0,pageviews INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(session_id,ip_address))",
"CREATE INDEX IF NOT EXISTS idx_vi_ip_recent ON visitor_ip_observations(last_seen_at DESC)",
];
let ready;
async function init(db){if(!ready)ready=(async()=>{for(const sql of DDL)await db.prepare(sql).run()})().catch(e=>{ready=null;throw e});return ready}
function json(v,status=200){return new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}})}
function originOk(req){const origin=req.headers.get("origin");return origin===new URL(req.url).origin}
function clean(v,n=90){return typeof v==="string"?v.replace(/[<>\x00-\x1f]/g,"").slice(0,n):""}
function pathOnly(v){const p=clean(v,180);return p.startsWith("/")&&!p.startsWith("//")&&!p.includes("?")&&!p.includes("#")?p:"/"}
function family(ua,kind){if(kind==="device")return /bot|crawler|spider/i.test(ua)?"bot":/ipad|tablet/i.test(ua)?"tablet":/mobile|iphone|android/i.test(ua)?"mobile":"desktop";if(kind==="browser")return /Edg\//.test(ua)?"Edge":/Firefox\//.test(ua)?"Firefox":/Chrome\//.test(ua)?"Chrome":/Safari\//.test(ua)?"Safari":"Other";return /Windows/i.test(ua)?"Windows":/iPhone|iPad|iOS/i.test(ua)?"iOS":/Android/i.test(ua)?"Android":/Mac OS/i.test(ua)?"macOS":/Linux/i.test(ua)?"Linux":"Other"}
function host(v){try{const u=new URL(v);return /^https?:$/.test(u.protocol)?u.hostname.slice(0,120):""}catch{return""}}
// Capture only the Cloudflare edge's connecting-IP headers, not browser-provided
// X-Forwarded-For fields. Some configurations preserve the real IPv6 separately.
function connectingIP(req){
 const raw=req.headers.get("cf-connecting-ipv6")||req.headers.get("cf-connecting-ip")||"";
 const ip=String(raw).trim();
 if(!ip||ip.length>45||!/^[0-9a-fA-F:.]+$/.test(ip))return "";
 if(ip.includes(":"))return ip.split(":").length>=3?ip:"";
 const octets=ip.split(".");
 return octets.length===4&&octets.every(n=>/^\d{1,3}$/.test(n)&&Number(n)<=255)?ip:"";
}
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
 // Bound write volume per session; additionally configure Cloudflare WAF rate limits.
 const recent=await env.DB.prepare("SELECT COUNT(*) AS n FROM visitor_events WHERE session_id=? AND event_at>=datetime('now','-1 day')").bind(data.session).first();
 if((recent?.n||0)>=300)return json({error:"Rate limit"},429);
 const s=env.DB.prepare("INSERT INTO visitor_sessions(session_id,country,region,city,asn,network_name,device_type,browser_family,os_family,referrer_host,landing_path,pageviews,events) VALUES(?,?,?,?,?,?,?,?,?,?,?,0,0) ON CONFLICT(session_id) DO NOTHING").bind(data.session,clean(cf.country,2),clean(cf.region,80),clean(cf.city,80),Number(cf.asn)||null,clean(cf.asOrganization,120),family(ua,"device"),family(ua,"browser"),family(ua,"os"),host(data.referrer),path);
 const e=env.DB.prepare("INSERT INTO visitor_events(session_id,event_type,path,section,record_id,search_result_count) VALUES(?,?,?,?,?,?)").bind(data.session,data.type,path,section,record,count);
 const u=env.DB.prepare("UPDATE visitor_sessions SET last_seen_at=CURRENT_TIMESTAMP,pageviews=pageviews+?,events=events+1 WHERE session_id=?").bind(data.type==="page_view"?1:0,data.session);
 const batch=[s,e,u];
 const ip=connectingIP(req);
 if(ip){
  // Keep a rolling observation per session and IP; no raw IP in logs or public routes.
  batch.push(env.DB.prepare("INSERT INTO visitor_ip_observations(session_id,ip_address,country,region,city,asn,network_name,device_type,browser_family,referrer_host,last_path,event_count,pageviews) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(session_id,ip_address) DO UPDATE SET last_seen_at=CURRENT_TIMESTAMP,last_path=excluded.last_path,event_count=event_count+1,pageviews=pageviews+excluded.pageviews").bind(data.session,ip,clean(cf.country,2),clean(cf.region,80),clean(cf.city,80),Number(cf.asn)||null,clean(cf.asOrganization,120),family(ua,"device"),family(ua,"browser"),host(data.referrer),path,data.type==="page_view"?1:0));
 }
 await env.DB.batch(batch);
 return new Response(null,{status:204,headers:{"cache-control":"no-store"}});
 }catch(err){console.error("Visitor event write failed",err);return json({error:"Temporarily unavailable"},503)}
}
function b64(s){return Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(s.length/4)*4,"=")),c=>c.charCodeAt(0))}
function accessDenial(reason){
 // Diagnostic categories only. Never log tokens, cookies, personal identities, or keys.
 console.warn("Genesis Visitor Intelligence: Access JWT rejected",reason);
 return false;
}
function accessCookie(req){
 // Cloudflare supplies a signed JWT in the assertion header; some routed browser
 // requests only carry the CF_Authorization cookie. Both MUST pass full verification.
 const cookie=(req.headers.get("cookie")||"").split(";").map(s=>s.trim()).find(s=>s.startsWith("CF_Authorization="));
 if(!cookie)return "";
 try{return decodeURIComponent(cookie.slice("CF_Authorization=".length))}catch{return ""}
}
async function accessAuthorized(req,env){
 if(!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD_API)return accessDenial("missing-worker-configuration");
 const token=req.headers.get("cf-access-jwt-assertion")||accessCookie(req);
 if(!token)return accessDenial("missing-access-assertion-and-cookie");
 const parts=token.split(".");
 if(parts.length!==3)return accessDenial("malformed-jwt");
 try{
  const header=JSON.parse(new TextDecoder().decode(b64(parts[0])));
  const payload=JSON.parse(new TextDecoder().decode(b64(parts[1])));
  const domain=env.ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//,"").replace(/\/$/,"");
  if(!/^[a-z0-9.-]+\.cloudflareaccess\.com$/i.test(domain))return accessDenial("invalid-team-domain");
  if(header.alg!=="RS256"||!header.kid)return accessDenial("unexpected-signing-algorithm");
  const now=Math.floor(Date.now()/1000);
  if(payload.iss!=="https://"+domain)return accessDenial("issuer-mismatch");
  if(!Array.isArray(payload.aud)||!payload.aud.includes(env.ACCESS_AUD_API))return accessDenial("application-audience-mismatch");
  if(typeof payload.exp!=="number"||payload.exp<=now||typeof payload.nbf==="number"&&payload.nbf>now)return accessDenial("token-outside-validity-window");
  const res=await fetch("https://"+domain+"/cdn-cgi/access/certs");
  if(!res.ok)return accessDenial("access-public-keys-unavailable");
  const keys=(await res.json()).keys||[];
  const jwk=keys.find(k=>k.kid===header.kid);
  if(!jwk)return accessDenial("jwt-signing-key-not-found");
  const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,b64(parts[2]),new TextEncoder().encode(parts[0]+"."+parts[1]));
  return valid||accessDenial("invalid-jwt-signature");
 }catch{return accessDenial("jwt-verification-exception")}
}
export async function visitorAdmin(req,env){
 if(!(await accessAuthorized(req,env)))return json({error:"Unauthorized; configure Cloudflare Access"},403);
 if(!env.DB)return json({error:"Database unavailable"},503);
 try{
 await init(env.DB);
 const [summary,events,countries,networks,sections,ipConnections]=await Promise.all([
 env.DB.prepare("SELECT COUNT(*) sessions,COALESCE(SUM(pageviews),0) pageviews,COALESCE(SUM(events),0) events FROM visitor_sessions WHERE first_seen_at>=datetime('now','-30 days')").first(),
 env.DB.prepare("SELECT event_type,COUNT(*) total FROM visitor_events WHERE event_at>=datetime('now','-30 days') GROUP BY event_type ORDER BY total DESC").all(),
 env.DB.prepare("SELECT country,COUNT(*) total FROM visitor_sessions WHERE first_seen_at>=datetime('now','-30 days') GROUP BY country ORDER BY total DESC LIMIT 20").all(),
 env.DB.prepare("SELECT asn,network_name,COUNT(*) total FROM visitor_sessions WHERE first_seen_at>=datetime('now','-30 days') GROUP BY asn,network_name ORDER BY total DESC LIMIT 20").all(),
 env.DB.prepare("SELECT section,COUNT(*) total FROM visitor_events WHERE event_at>=datetime('now','-30 days') AND section!='' GROUP BY section ORDER BY total DESC LIMIT 20").all(),
 env.DB.prepare("SELECT ip_address,MAX(last_seen_at) AS last_seen_at,MIN(first_seen_at) AS first_seen_at,COUNT(DISTINCT session_id) AS sessions,SUM(pageviews) AS pageviews,SUM(event_count) AS events,MAX(network_name) AS network_name,MAX(asn) AS asn,MAX(country) AS country,MAX(region) AS region,MAX(city) AS city,MAX(device_type) AS device_type,MAX(referrer_host) AS referrer_host FROM visitor_ip_observations WHERE last_seen_at>=datetime('now','-30 days') GROUP BY ip_address ORDER BY last_seen_at DESC LIMIT 250").all()
 ]);
 return json({period:"last 30 days",summary,events:events.results,countries:countries.results,networks:networks.results,sections:sections.results,ipConnections:ipConnections.results,ipRetentionDays:30});
 }catch(err){console.error("Visitor admin read failed",err);return json({error:"Analytics unavailable"},503)}
}
export async function visitorCleanup(env){
 if(!env.DB)return;
 await init(env.DB);
 await env.DB.batch([
 env.DB.prepare("DELETE FROM visitor_ip_observations WHERE last_seen_at<datetime('now','-30 days')"),
 env.DB.prepare("DELETE FROM visitor_events WHERE event_at<datetime('now','-90 days')"),
 env.DB.prepare("DELETE FROM visitor_sessions WHERE last_seen_at<datetime('now','-90 days')")
 ]);
}
