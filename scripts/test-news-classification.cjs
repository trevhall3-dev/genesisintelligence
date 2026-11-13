"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm");
const app=fs.readFileSync("dist/app.js","utf8");
const index=fs.readFileSync("dist/index.html","utf8");
const worker=fs.readFileSync("src/worker.js","utf8");
const css=fs.readFileSync("dist/styles.css","utf8");
const archive=JSON.parse(fs.readFileSync("dist/news-archive.json","utf8"));
const start=app.indexOf("const labPublisherHosts=");
const stop=app.indexOf("function isMatch(",start);
assert(start>=0&&stop>start,"Browser publisher classifier missing");
const classify=vm.runInNewContext(app.slice(start,stop)+";publisherGroup;",{URL});
const cases=[
 ["https://www.energy.gov/science/articles/mission","Brookhaven National Laboratory","DOE"],
 ["https://www.pnnl.gov/news-media/research","U.S. Department of Energy","Labs"],
 ["https://www.ornl.gov/news/lab","DOE","Labs"],
 ["https://als.lbl.gov/article","Argonne Lab","Labs"],
 ["https://news.mit.edu/2026/research","DOE","Partners"],
 ["https://www.prnewswire.com/news-releases/company","Argonne","Partners"],
 ["https://newsroom.cadence.com/press-releases/release","DOE","Partners"],
 ["https://www.energy.gov/nnsa/listings/los-alamos","Los Alamos National Laboratory","DOE"],
 ["https://netl.doe.gov/news","DOE","Labs"]
];
for(const [url,source,expected] of cases)assert.equal(classify({url,source,group:"Partners"}),expected,url);
const groups=["DOE","Labs","Partners"];
assert.equal(new Set(archive.items.map(i=>i.url)).size,archive.items.length,"News archive has duplicate URLs");
for(const item of archive.items){assert(groups.includes(item.group));assert.equal(item.group,classify(item),item.url+" archive tier incorrect")}
assert.equal(archive.items.reduce((n,x)=>n+(groups.includes(x.group)?1:0),0),archive.items.length);
const tabs=[...index.matchAll(/data-tier="([^"]+)"/g)].map(m=>m[1]);
assert.deepEqual(tabs,["All","DOE","Labs","Partners"]);
assert(!index.includes('id="partnershipInfo"'),"Private partnership button remains");
assert(!app.includes('$("partnershipInfo")'),"Private partnership handler remains");
assert(!app.includes("Partnership candidates are collected privately"),"Stale private partnership notice");
assert(worker.includes('partnerCandidateCollection:"paused"'),"Private partnership discovery must be paused");
assert(!worker.includes("const connections=await linkProjectsAndCandidates(env)"),"Private candidate generator is active");
assert(worker.includes("map(i=>({...i,group:publisherGroup(i)}))"),"D1 response needs publisher classification");
assert(app.includes("function filterType(item){return publisherGroup(item)}"),"Frontend filters must use original publisher");
for(const text of [
 "About Genesis Intel (SI)",
 "future AI-assisted Super Intelligence",
 "Announced project funding does not necessarily reflect money awarded or paid.",
 "Research tags are provisional classifications developed by Genesis Intel.",
 "Office of Synergy is an independent creative identity behind Genesis Intel.",
 "It is not affiliated with any government office, department, or agency.",
 "The subtle <strong>S and i</strong>"
])assert(app.includes(text),"Missing exact approved About text: "+text);
assert(!app.includes("Private candidate partnerships are not published."),"Deleted disclaimer is still present");
const top=index.match(/<div class="pillars">([\s\S]*?)<\/div>/)[1];
assert.deepEqual([...top.matchAll(/data-pillar="([^"]+)"/g)].map(m=>m[1]),["News","Projects","National challenges","Labs"]);
const sidebar=index.indexOf('data-section="National challenges"');
const themes=index.indexOf('id="challengeThemes"');
const labs=index.indexOf('data-section="Labs"');
assert(sidebar>=0&&themes>sidebar&&labs>themes,"Challenge Themes sidebar placement changed");
assert(index.includes('data-lucide="list-filter"'),"Challenge Themes funnel icon changed");
assert(index.includes('href="/favicon.ico"')&&index.includes('href="/favicon-32.png"'),"Favicon links missing");
assert(index.includes('id="viewSubtitle" class="view-subtitle">The Live Signal'),"News subtitle missing");
assert(css.includes("max-width:800px")&&css.includes("max-width:1330px"),"Tablet/mobile breakpoints missing");
console.log("Publisher tiers, "+archive.items.length+" archive items, private partnership pause, About copy, icon/navigation regressions: PASS");
