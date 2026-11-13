"use strict";
// Genesis Intelligence Hub Build 2.1 — news-first, readable and source-grounded.
const $=id=>document.getElementById(id);
const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl=value=>{try{let u=new URL(value,location.origin);return u.protocol==="https:"?u.href:"#"}catch{return"#"}};
const dateLabel=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}):"Date unavailable";
const newsDate=item=>item.gih_added_at||item.gih_added_date||item.date||item.selection_date||"";
const areas=["Data","Infrastructure","AI models","National challenges"];
const areaLabels={"Data":"Data","Infrastructure":"Infrastructure","AI models":"AI Models","National challenges":"National Challenges"};
const icons={"Data":"database","Infrastructure":"server","AI models":"cpu","National challenges":"target"};
const primarySources=[
 {title:"DOE Genesis Mission",url:"https://www.energy.gov/undersecretaryforscience/genesis-mission/genesis-mission",source:"DOE"},
 {title:"Official DOE Genesis News",url:"https://www.energy.gov/undersecretaryforscience/genesis-mission/listings/genesis-mission-news",source:"DOE"},
 {title:"Genesis Mission Platform",url:"https://genesis.energy.gov/",source:"DOE"},
 {title:"DOE Genesis Project Selections",url:"https://www.energy.gov/documents/genesis-mission-rfa-awards-list",source:"DOE"}
];
const state={news:[],projects:[],challenges:[],sources:[],health:null,archiveAt:"",registryLabel:"Official DOE selection registry",section:"All",tier:"All",area:null,limit:40,activeQuery:"",context:""};
const cache=new Set();
function dedupe(rows){cache.clear();return rows.filter(row=>{const key=row.url||row.title;if(cache.has(key))return false;cache.add(key);return true})}
const labPublisherHosts=["anl.gov","ornl.gov","bnl.gov","lbl.gov","pnnl.gov","lanl.gov","llnl.gov","fnal.gov","sandia.gov","slac.stanford.edu","jlab.org","pppl.gov","nrel.gov","inl.gov","ameslab.gov","srnl.gov","netl.doe.gov","frib.msu.edu"];
function publisherGroup(item){
 let host="";
 try{host=new URL(String(item.url||"")).hostname.toLowerCase()}catch{}
 const isHost=d=>host===d||host.endsWith("."+d);
 if(labPublisherHosts.some(isHost))return"Labs";
 if(isHost("energy.gov"))return"DOE";
 if(host)return"Partners";
 const source=String(item.source||"").toLowerCase();
 if(/national laborator|oak ridge|argonne|brookhaven|berkeley lab|pnnl|llnl|sandia|los alamos|fermilab/.test(source))return"Labs";
 if(/department of energy|^doe$/.test(source))return"DOE";
 return ["DOE","Labs","Partners"].includes(item.group)?item.group:"Partners";
}
function filterType(item){return publisherGroup(item)}
function isMatch(d,q){if(!q)return true;const hay=[d.title,d.summary,d.description,d.classification,d.source,d.institution,d.principal_investigator,d.city,d.state,d.category,d.group,d.source_phase,...(d.categories||[])].join(" ").toLowerCase();return q.split(/\s+/).every(x=>hay.includes(x))}
function records(){
 const q=state.activeQuery;
 let list;
 if(state.section==="Projects")list=state.area==="National challenges"?state.challenges.map(p=>({...p,kind:"challenge"})):state.projects.map(p=>({...p,kind:"project"}));
 else if(state.section==="Sources")list=primarySources.map(p=>({...p,kind:"source"}));
 else if(state.section==="All"&&q)list=[...state.news,...state.projects.map(p=>({...p,kind:"project"})),...state.challenges.map(p=>({...p,kind:"challenge"}))];
 else list=state.news.filter(i=>(state.section!=="Labs"||filterType(i)==="Labs"));
 if(state.area)list=list.filter(i=>(i.categories||[i.category]).includes(state.area));
 if(state.context)list=list.filter(i=>(state.area==="National challenges"?i.group:i.source)===state.context);
 if(state.tier!=="All"&&state.section!=="Projects"&&state.section!=="Sources")list=list.filter(i=>filterType(i)===state.tier);
 list=dedupe(list).filter(i=>isMatch(i,q));
 const order=$("sort").value;
 list.sort((a,b)=>order==="az"||state.section==="Projects"&&order==="new"
 ?String(a.title||"").localeCompare(String(b.title||""))
 :order==="old"?String(newsDate(a)).localeCompare(String(newsDate(b)))
 :String(newsDate(b)).localeCompare(String(newsDate(a))));
 return list;
}
function sectionTitle(){const title=state.area==="National challenges"?"OFFICIAL NATIONAL CHALLENGES":(state.section==="All"&&state.activeQuery)?"GENESIS SEARCH RESULTS":state.section==="Projects"?"GENESIS PROJECT REGISTRY":state.section==="Archive"?"GENESIS INTELLIGENCE ARCHIVE":state.section==="Sources"?"OFFICIAL SOURCES":state.section==="Labs"?"GENESIS LABORATORY NEWS":"GENESIS NEWS";$("feedTitle").textContent=title}
function render(){
 sectionTitle();
 renderContext();
 $("viewSubtitle").textContent=state.area==="National challenges"?"The Grand Pursuits":state.section==="Projects"?"The Foundation":state.section==="Labs"?"The Engines of Discovery":state.section==="Archive"?"The Institutional Memory":state.section==="Sources"?"Publisher and reference sources":"The Live Signal";
 $("challengeIntro").hidden=state.area!=="National challenges";
 const list=records();
 if(state.area==="National challenges")$("feedStatus").textContent="Official DOE challenge catalog · 33 National Science & Technology Challenges";
 else if(state.section==="Projects")$("feedStatus").textContent="Official DOE registry · "+state.projects.length+" project selections";
 else if(state.section==="Sources")$("feedStatus").textContent="Official references and monitored publishers";
 else $("feedStatus").textContent=(state.section==="Labs"?"Laboratory news · ":"Publisher archive · ")+state.news.length+" collected articles";
 $("recordCount").textContent=list.length;
 $("count").textContent=state.area==="National challenges"?list.length+" official challenges · DOE source list · not project awards":state.section==="Projects"?list.length+" matching projects · "+state.registryLabel:list.length+" source-linked records";
 $("rows").innerHTML=list.slice(0,state.limit).map(item=>{
  const challenge=item.kind==="challenge",project=item.kind==="project",source=item.kind==="source";
  const url=safeUrl(project||challenge?item.source_url:item.url);
  const head='<a class="compact-title" target="_blank" rel="noopener noreferrer" href="'+url+'">'+
   '<span class="article-glyph"><i data-lucide="'+(challenge?"target":project?"files":source?"link":"newspaper")+'"></i></span>'+
   '<span class="headline">'+safe(item.title)+'</span><i data-lucide="external-link" class="item-arrow"></i></a>';
  const sourceName=challenge?item.group:project?(item.institution||"Lead institution not listed"):source?item.source||"Official source":item.source||filterType(item);
  const detail=challenge?"Official DOE challenge · not a project award":project?([item.principal_investigator?"PI: "+item.principal_investigator:"",item.source_phase||"DOE project selection"].filter(Boolean).join(" · ")):source?"Official Genesis reference":item.gih_added_date?"Added to Genesis Intel "+dateLabel(item.gih_added_date)+" · Published "+dateLabel(item.source_published_at||item.date):dateLabel(item.date);
  const tags=project?'<span class="record-tag">'+safe((item.categories||[item.category]).filter(t=>areas.includes(t)).slice(0,2).map(t=>areaLabels[t]).join(" · "))+'</span>':"";
  return '<article class="compact-item">'+head+'<div class="compact-meta"><span class="article-source">'+safe(sourceName)+'</span><span class="article-date">'+safe(detail)+'</span>'+tags+'</div>'+(challenge&&item.description?'<p class="challenge-description">'+safe(item.description)+'</p>':'')+'</article>';
 }).join("")||'<p class="empty">No records match this view. Try All, clear search, or choose another category.</p>';
 $("more").hidden=list.length<=state.limit;
 document.querySelectorAll("[data-tier]").forEach(b=>{b.classList.toggle("selected",b.dataset.tier===state.tier);b.setAttribute("aria-pressed",String(b.dataset.tier===state.tier))});
 document.querySelectorAll("[data-section]").forEach(b=>{const active=state.area?state.area===b.dataset.section:state.section===b.dataset.section;b.classList.toggle("active",active);b.setAttribute("aria-current",active?"page":"false")});
 document.querySelector(".tier-tabs").hidden=state.section==="Projects"||state.section==="Sources"||state.section==="Labs";
 const pills=document.querySelectorAll("[data-pillar]");pills.forEach(b=>b.classList.toggle("current",(b.dataset.pillar==="National challenges"?state.area==="National challenges":(b.dataset.pillar===state.section||b.dataset.pillar==="News"&&state.section==="All")&&state.area!=="National challenges")));
 renderTracker();if(window.lucide)window.lucide.createIcons();
}
function renderTracker(){
 const projects=state.projects||[];
 const countArea=area=>area==="National challenges"?state.challenges.length:projects.filter(p=>(p.categories||[p.category]).includes(area)).length;
 const max=Math.max(1,...areas.map(countArea));
 $("trackerBars").innerHTML=areas.map(area=>{
  const n=countArea(area);
  return '<button type="button" class="tracker-row tracker-button" data-track="'+safe(area)+'" title="Show '+safe(area)+(area==="National challenges"?' challenges':' projects')+'"><span class="tracker-label"><i data-lucide="'+icons[area]+'"></i>'+areaLabels[area]+'</span><span class="tracker-track"><span class="tracker-fill" style="width:'+Math.round(n/max*100)+'%"></span></span><strong class="tracker-count">'+n+'</strong></button>';
 }).join("");
 document.querySelectorAll("[data-track]").forEach(button=>button.onclick=()=>{state.section="Projects";state.context="";state.area=button.dataset.track;$("challengeThemes").open=state.area==="National challenges";state.tier="All";state.limit=40;state.activeQuery="";$("search").value="";render();document.querySelector(".feed").scrollIntoView({behavior:"smooth",block:"start"})});
}
function renderContext(){
 const challenge=state.area==="National challenges",labs=state.section==="Labs";
 const themes=[...new Set(state.challenges.map(i=>i.group).filter(Boolean))].sort();
 $("challengeThemeSelect").innerHTML='<option value="">All challenge themes</option>'+themes.map(v=>'<option value="'+safe(v)+'">'+safe(v)+'</option>').join("");
 $("challengeThemeSelect").value=challenge?state.context:"";
 $("contextFilters").hidden=!labs;
 if(!challenge&&!labs)return;
 const values=[...new Set((challenge?state.challenges:state.news.filter(i=>filterType(i)==="Labs")).map(i=>challenge?i.group:i.source).filter(Boolean))].sort();
 $("contextLabel").textContent=challenge?"Challenge themes":"Laboratory sources";
 $("contextSelect").innerHTML='<option value="">'+(challenge?"All challenge themes":"All laboratories")+'</option>'+values.map(v=>'<option value="'+safe(v)+'">'+safe(v)+'</option>').join("");
 $("contextSelect").value=state.context;
}
function setView(view){
 $("challengeThemes").open=view==="National challenges";
 state.context="";
 state.section=areas.includes(view)?"Projects":view;state.area=areas.includes(view)?view:null;
 state.tier="All";state.activeQuery="";state.limit=40;$("search").value="";
 $("sort").value=state.section==="Projects"?"az":"new";
 render();document.querySelector(".feed").scrollIntoView({behavior:"smooth",block:"start"});
}
function renderSources(){
 $("sidebarSourceLinks").innerHTML=[...primarySources,...state.sources.map(s=>({title:s.name,url:s.endpoint}))].map(s=>s.url?'<a target="_blank" rel="noopener noreferrer" href="'+safeUrl(s.url)+'">'+safe(s.title)+'</a>':'<span class="monitored-source">'+safe(s.title)+'</span>').join("");
 const list=state.sources.length?state.sources:[{name:"DOE Genesis Mission News",group:"DOE",ok:false,count:0}];
 const ok=list.filter(s=>s.ok).length;
 $("sourceState").textContent=ok+"/"+list.length+" reachable";
 $("sourceState").classList.toggle("ok",ok>0);
 $("sourceMonitor").innerHTML=list.map(s=>'<div class="monitor-row"><i data-lucide="'+(s.ok?"check-square":"alert-triangle")+'"></i><span>'+safe(s.name)+'</span><small>'+(s.ok?Number(s.count||0)+" items":"Check failed")+'</small></div>').join("");
 if(window.lucide)window.lucide.createIcons();
}
function renderHealth(){
 const h=state.health;
 const status=h?.status==="synced"?"D1 synchronized":h?.status==="pending-initial-import"?"D1 import pending":h?.databaseBound?"D1 status unavailable":"D1 connection unverified";
 const projectCount=h?.projects??state.projects.length,newsCount=h?.articles??state.news.length;
 $("collectorHealth").innerHTML='<div class="health-stat"><i data-lucide="database"></i><span>Project records</span><strong>'+Number(projectCount||0)+'</strong></div>'+
 '<div class="health-stat"><i data-lucide="newspaper"></i><span>Archived articles</span><strong>'+Number(newsCount||0)+'</strong></div>'+
 '<div class="health-stat"><i data-lucide="server"></i><span>Database</span><strong>'+safe(status)+'</strong></div>';
 if(window.lucide)window.lucide.createIcons();
}
async function readJson(path){const res=await fetch(path,{cache:"no-cache"});if(!res.ok)throw Error(path+": HTTP "+res.status);return res.json()}
async function fetchAll(){
 $("refresh").disabled=true;$("feedStatus").textContent="Loading Genesis records from official sources…";
 const result=await Promise.allSettled([readJson("/api/projects"),readJson("/api/news"),readJson("/api/health"),readJson("/challenges.json")]);
 if(result[0].status==="fulfilled"){
  const body=result[0].value;
  state.projects=Array.isArray(body.projects)?body.projects:[];
  state.registryLabel=body.metadata?.source||"DOE source registry";
 }else{
  try{state.projects=(await readJson("/projects.json")).projects||[]}
  catch{state.projects=[]}
 }
 if(result[1].status==="fulfilled"){
  const body=result[1].value;state.news=(Array.isArray(body.items)?body.items:[]).map(i=>({...i,group:publisherGroup(i)}));state.sources=body.sources||[];state.archiveAt=body.checkedAt||"";
 }else{
  try{const body=await readJson("/news-archive.json");state.news=(body.items||[]).map(i=>({...i,group:publisherGroup(i)}));state.sources=body.sources||[];state.archiveAt=body.updated_at||""}catch{state.news=[];state.sources=[]}
 }
 state.challenges=result[3].status==="fulfilled"?(result[3].value.challenges||[]):[];
 state.health=result[2].status==="fulfilled"?result[2].value:null;
 const stamp=state.archiveAt&&Number.isFinite(Date.parse(state.archiveAt))?new Date(state.archiveAt).toLocaleString("en-US",{dateStyle:"medium",timeStyle:"short"}):"Date not reported";
 $("feedStatus").textContent=state.news.length?("Official publisher archive: "+state.news.length+" articles · Updated "+stamp):"No articles available yet. Review collector status.";
 $("refresh").disabled=false;
 renderSources();renderHealth();render();
}
document.querySelectorAll("[data-section]").forEach(b=>b.onclick=()=>setView(b.dataset.section));
document.querySelectorAll("[data-pillar]").forEach(b=>b.onclick=()=>setView(b.dataset.pillar));
document.querySelectorAll("[data-tier]").forEach(b=>b.onclick=()=>{state.tier=b.dataset.tier;state.limit=40;render()});
$("challengeThemeSelect").onchange=()=>{const theme=$("challengeThemeSelect").value;setView("National challenges");state.context=theme;render()};
$("contextSelect").onchange=()=>{state.context=$("contextSelect").value;state.limit=40;render()};
$("search").oninput=()=>{state.activeQuery=$("search").value.toLowerCase().trim();state.limit=40;render()};
$("searchBtn").onclick=()=>{$("search").focus();state.activeQuery=$("search").value.toLowerCase().trim();render()};
$("sort").onchange=render;$("more").onclick=()=>{state.limit+=40;render()};$("refresh").onclick=fetchAll;
$("researchToggle").onclick=()=>{const el=$("researchSub");el.hidden=!el.hidden;$("researchToggle").setAttribute("aria-expanded",String(!el.hidden))};
$("viewProjects").onclick=()=>setView("Projects");$("resources").onclick=()=>setView("Sources");
function comingSoon(){$("dialogBody").innerHTML="<h2>Ask Genesis SI</h2><p>Coming Soon. Genesis Intel is currently publishing verified research and editorial intelligence briefings. A conversational assistant may be added in a future release.</p>";$("dialog").showModal()}
$("askAI").onclick=comingSoon;$("pillarAI").onclick=comingSoon;
$("about").onclick=()=>{$("dialogBody").innerHTML="<h2>About Genesis Intel (SI)</h2><p>This is an independent public-source intelligence dashboard about the DOE Genesis Mission. It is not an official DOE website or endorsed by DOE.</p><p>Genesis Intel is an independently developed, cloud-native scientific intelligence platform built to monitor and organize the evolving U.S. Department of Energy Genesis Mission. Powered by Cloudflare serverless infrastructure, a structured SQL intelligence database, Python-based research collectors, GitHub automation and a custom JavaScript dashboard, the platform brings together hundreds of documented projects, official national challenges and continuously collected research news. Its evidence-first methodology emphasizes source traceability, affiliation verification and responsible classification, creating a foundation for future AI-assisted Super Intelligence.</p><p>Announced project funding does not necessarily reflect money awarded or paid. Research tags are provisional classifications developed by Genesis Intel. News links open original publisher pages in new tabs.</p><h3>Office of Synergy</h3><p>Office of Synergy is an independent creative identity behind Genesis Intel. It is not affiliated with any government office, department, or agency. It reflects a quiet interest in the intersection of human ingenuity, scientific discovery and emerging intelligence. Its name suggests the value of bringing ideas, information and technology together in unexpected ways. The subtle <strong>S and i</strong> carry a nod to scientific intelligence, strategic intelligence and superintelligence.</p>";$("dialog").showModal()};
$("close").onclick=()=>$("dialog").close();
render();renderSources();renderHealth();fetchAll();

