// First-party session analytics: no cookies, no fingerprinting, no search terms.
(()=>{"use strict";
const KEY="gih_visitor_session_v1";
let session;
try{session=sessionStorage.getItem(KEY);if(!session||!/^[a-f0-9-]{36}$/.test(session)){session=crypto.randomUUID();sessionStorage.setItem(KEY,session)}}catch{session=crypto.randomUUID()}
function send(type,extra={}){
 const payload={session,type,path:location.pathname,referrer:document.referrer,...extra};
 const body=JSON.stringify(payload);
 try{if(navigator.sendBeacon){const blob=new Blob([body],{type:"application/json"});if(navigator.sendBeacon("/api/visitor-event",blob))return}}catch{}
 fetch("/api/visitor-event",{method:"POST",headers:{"content-type":"application/json"},body,keepalive:true,credentials:"same-origin"}).catch(()=>{});
}
window.GIHVisitor={track:send};
send("page_view");
document.addEventListener("click",e=>{
 const a=e.target.closest("a[href]");if(!a)return;
 const href=a.getAttribute("href")||"";
 if(a.closest(".weekly-feature")||href.includes("/briefings/"))send("briefing_open",{section:"Weekly Briefing"});
 else if(a.closest(".compact-item")){
 const section=document.getElementById("feedTitle")?.textContent||"Genesis News";
 send(section.includes("PROJECT")?"project_open":section.includes("SOURCE")?"source_open":"article_open",{section:section.slice(0,50)});
 }
},true);
document.addEventListener("click",e=>{
 const button=e.target.closest("[data-section],[data-pillar],[data-track]");
 if(button)send("section_view",{section:(button.dataset.section||button.dataset.pillar||button.dataset.track||"").slice(0,50)});
},true);
const search=document.getElementById("search");
if(search){let timer;search.addEventListener("input",()=>{
 clearTimeout(timer);if(!search.value.trim())return;
 timer=setTimeout(()=>{const count=Number(document.getElementById("recordCount")?.textContent);send("search",{section:"Site Search",results:Number.isFinite(count)?count:null})},1200)
})}
})();
