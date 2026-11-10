(function(){
"use strict";
/* ---------- config ---------- */
const SB_URL="https://zhlmwyxnkonqycsfrhly.supabase.co";
const SB_KEY="sb_publishable_1ynmg168ubLPP-vgYZrJhA_EjhRF4Vj";
const CLAUDE_FN=SB_URL+"/functions/v1/jikai-claude";
const ANI="https://graphql.anilist.co";
const TZ="Europe/Copenhagen";
const KANJI=["日","月","火","水","木","金","土"];
const COLORS=["#2F4B8F","#B8402F","#3F7346","#B4466F","#8A6A12","#3B7C8C"];
const ACCENTS={
  indigo:{l:["#2F4B8F","#E4E9F5"],d:["#93ACEB","#1E2944"]},
  vermilion:{l:["#B8402F","#F6E4E0"],d:["#F07A68","#3A2220"]},
  matcha:{l:["#3F7346","#E3EFE2"],d:["#8CCB8F","#1D3022"]},
  sakura:{l:["#B4466F","#F7E4EB"],d:["#F09ABB","#3A2030"]},
  gold:{l:["#8A6A12","#F3ECD9"],d:["#E2BF5C","#352C15"]}
};
const S={key:null,me:null,titles:{},people:{},progress:{},ratings:{},settings:{},loaded:false,locked:false,online:true,
  tab:"feed",q:"",filter:"all",open:null,sel:null,epPage:0,chat:[],chatBusy:false,ani:{q:"",type:"ANIME",res:[],busy:false},libAni:{q:"",res:[],busy:false},syncedAt:0};
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ls={get(k){try{return localStorage.getItem(k)}catch(_){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(_){}},del(k){try{localStorage.removeItem(k)}catch(_){}}};

/* ---------- dates ---------- */
const today=()=>new Date().toLocaleDateString("sv-SE",{timeZone:TZ});
const cphDate=ms=>new Date(ms).toLocaleDateString("sv-SE",{timeZone:TZ});
const toD=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(Date.UTC(y,m-1,d))};
const fromD=d=>d.toISOString().slice(0,10);
const addDays=(s,n)=>{const d=toD(s);d.setUTCDate(d.getUTCDate()+n);return fromD(d)};
const addMonth=s=>{const d=toD(s);const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return fromD(d)};
const diff=(a,b)=>Math.round((toD(b)-toD(a))/864e5);
const fmt=s=>toD(s).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",timeZone:"UTC"});
const fmtLong=s=>toD(s).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"});
const rel=s=>{const n=diff(today(),s);return n===0?"Today":n===1?"Tomorrow":n<0?(n===-1?"Yesterday":(-n)+" days ago"):n<7?"In "+n+" days":n<14?"Next week":"In "+Math.round(n/7)+" weeks"};
const dow=s=>toD(s).getUTCDay();
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
function step(d,cad,breaks){let n=cad==="monthly"?addMonth(d):addDays(d,7);let g=0;while(breaks&&breaks.includes(n)&&g++<10)n=cad==="monthly"?addMonth(n):addDays(n,7);return n}
function proj(t){
  let latest=Number(t.latest)||0, n=t.next&&t.next.n, d=t.next&&t.next.date, est=!!(t.next&&t.next.est), latestDate=t.latestDate||null;
  const td=today();
  if(n&&d){let g=0;while(d<td&&t.cadence&&g++<104){latest=Math.max(latest,n);latestDate=d;n++;d=step(d,t.cadence,t.breaks);est=true}
    if(d<td&&!t.cadence){latest=Math.max(latest,n);latestDate=d;n=null;d=null}}
  return {latest,latestDate,next:n&&d?{n,date:d,est}:null};
}
function occurrences(t,from,to){const p=proj(t);const out=[];if(!p.next)return out;let n=p.next.n,d=p.next.date,first=true,g=0;while(d<=to&&g++<40){if(d>=from)out.push({n,date:d,est:first?p.next.est:true});if(!t.cadence)break;n++;d=step(d,t.cadence,t.breaks);first=false}return out}
const unit=t=>t.kind==="anime"?(t.format==="MOVIE"?"Movie":"Ep"):(t.kind==="novel"?"Vol":"Ch");
const unitWord=t=>t.kind==="anime"?(t.format==="MOVIE"?"movie":"episode"):(t.kind==="novel"?"volume":"chapter");

/* ---------- backend (Supabase RPC, guarded by the board key in the link) ---------- */
async function rpc(fn,args){
  const r=await fetch(SB_URL+"/rest/v1/rpc/"+fn,{method:"POST",headers:{apikey:SB_KEY,"Content-Type":"application/json"},body:JSON.stringify(Object.assign({k:S.key},args||{}))});
  if(!r.ok){let msg="";try{msg=(await r.json()).message||""}catch(_){}
    const e=new Error(/invalid board key/.test(msg)?"locked":(msg||("HTTP "+r.status)));e.locked=/invalid board key/.test(msg);throw e}
  const t=await r.text();return t?JSON.parse(t):null;
}
async function load(){
  try{const st=await rpc("jk_state");S.online=true;
    const T={};(st.titles||[]).forEach(t=>T[t.id]=t);S.titles=T;
    const P={};(st.people||[]).forEach(p=>P[p.id]=p);S.people=P;
    const G={};(st.progress||[]).forEach(p=>G[p.person+"__"+p.tid]=p);S.progress=G;
    const R={};(st.ratings||[]).forEach(r=>R[r.person+"__"+r.tid+"__"+r.n]=r);S.ratings=R;
    S.settings=st.settings||{};applyAccent();S.loaded=true;S.locked=false;
  }catch(e){if(e.locked){S.locked=true;S.loaded=true;ls.del("jikai.key")}else{S.online=false}}
  keepFocus(render);
}

/* ---------- AniList ---------- */
const FIELDS=`id type format status countryOfOrigin episodes chapters volumes title{english romaji native} synonyms startDate{year month day} nextAiringEpisode{episode airingAt} coverImage{large color} genres averageScore seasonYear`;
async function ani(query,variables){const r=await fetch(ANI,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({query,variables})});const j=await r.json();if(j.errors)throw new Error(j.errors[0].message);return j.data}
async function aniSearch(q,type){
  const qs=(t)=>`query($s:String){Page(perPage:12){media(search:$s,type:${t},sort:[SEARCH_MATCH,POPULARITY_DESC],isAdult:false){${FIELDS}}}}`;
  if(type==="BOTH"){const [a,m]=await Promise.all([ani(qs("ANIME"),{s:q}),ani(qs("MANGA"),{s:q})]);return [...a.Page.media.slice(0,8),...m.Page.media.slice(0,8)]}
  return (await ani(qs(type),{s:q})).Page.media;
}
async function aniByIds(ids){const out=[];for(let i=0;i<ids.length;i+=50){const d=await ani(`query($ids:[Int]){Page(perPage:50){media(id_in:$ids){${FIELDS}}}}`,{ids:ids.slice(i,i+50)});out.push(...d.Page.media)}return out}
const aniName=m=>m.title.english||m.title.romaji||m.title.native;
function aniKind(m){return m.type==="ANIME"?"anime":(m.format==="NOVEL"?"novel":"manga")}
function aniFormat(m){if(m.type==="MANGA"&&m.format==="MANGA"){if(m.countryOfOrigin==="KR")return "MANHWA";if(m.countryOfOrigin==="CN")return "MANHUA"}return m.format||""}
function aniStatus(m){return {RELEASING:"airing",NOT_YET_RELEASED:"upcoming",HIATUS:"hiatus",FINISHED:"finished",CANCELLED:"finished"}[m.status]||"upcoming"}
function aniWindow(m){const s=m.startDate||{};if(m.status!=="NOT_YET_RELEASED")return "";if(s.year&&s.month)return MONTHS[s.month-1]+" "+s.year;if(s.year)return String(s.year);return ""}
function fromAni(m,base){
  const t=Object.assign({},base||{});const kind=aniKind(m);
  t.anilist=m.id;t.kind=kind;t.format=aniFormat(m);
  const st=aniStatus(m);
  /* AniList often lists paused manga as releasing; keep a hiatus someone set unless AniList says it ended. */
  t.status=(base&&base.status==="hiatus"&&st==="airing"&&!base.lookup)?"hiatus":st;
  if(!t.window&&st==="upcoming"&&!aniWindow(m))t.window="Announced, no date";
  if(!base||!base.name||base.lookup)t.name=aniName(m);
  if(!t.series)t.series=aniName(m);
  t.cover=m.coverImage&&m.coverImage.large||t.cover||"";t.color=(m.coverImage&&m.coverImage.color)||t.color||"#5b6478";
  t.genres=(m.genres||[]).slice(0,3);if(m.averageScore)t.score=m.averageScore;
  const total=kind==="anime"?m.episodes:(kind==="novel"?m.volumes:m.chapters);if(total)t.total=total;
  if(kind==="anime"){
    if(m.nextAiringEpisode){t.next={n:m.nextAiringEpisode.episode,date:cphDate(m.nextAiringEpisode.airingAt*1000),est:false};t.latest=Math.max(0,m.nextAiringEpisode.episode-1);if(m.format==="TV"||m.format==="ONA"||m.format==="TV_SHORT")t.cadence="weekly";t.window=""}
    else if(t.status==="finished"){t.next=null;t.cadence="";t.latest=total||t.latest||0;t.window=""}
    else if(t.status==="upcoming"){t.window=aniWindow(m)||t.window||"";if(!t.next)t.next=null}
  }else{
    if(t.status==="finished"){t.next=null;t.cadence="";t.latest=Math.max(Number(t.latest)||0,total||0)}
    else if(total)t.latest=Math.max(Number(t.latest)||0,total);
    if(t.status==="upcoming"&&!t.next)t.window=aniWindow(m)||t.window||"";
  }
  t.lookup=false;t.source="AniList";t.updated=new Date().toISOString();
  return t;
}
const watched=["kind","format","status","latest","total","next","cadence","window","cover","color","score","name"];
function changed(a,b){return watched.some(k=>JSON.stringify(a[k]==null?null:a[k])!==JSON.stringify(b[k]==null?null:b[k]))}
/* Pulls fresh schedules for every title on open, writes back what changed so everyone sees it. */
async function syncAniList(){
  const last=Number(ls.get("jikai.sync")||0);if(Date.now()-last<20*60*1000)return;ls.set("jikai.sync",String(Date.now()));
  try{
    const list=Object.values(S.titles);const ids=list.filter(t=>t.anilist).map(t=>t.anilist);
    const byId={};(await aniByIds(ids)).forEach(m=>byId[m.id]=m);
    for(const t of list.filter(t=>t.lookup&&!t.anilist)){try{const kind=t.kind==="anime"?"ANIME":"MANGA";const r=(await ani(`query($s:String){Media(search:$s,type:${kind}){${FIELDS}}}`,{s:t.name})).Media;if(r)byId["L"+t.id]=r}catch(_){}}
    let n=0;
    for(const t of list){const m=t.anilist?byId[t.anilist]:byId["L"+t.id];if(!m)continue;const nt=fromAni(m,t);
      if(t.lookup||changed(t,nt)){S.titles[t.id]=nt;n++;try{await rpc("jk_put_title",{tid:t.id,d:nt})}catch(_){}}}
    S.syncedAt=Date.now();if(n)render();
  }catch(_){}
}

/* ---------- derived ---------- */
const list=()=>Object.values(S.titles).sort((a,b)=>(a.series||a.name).localeCompare(b.series||b.name)||(a.order||99)-(b.order||99)||a.name.localeCompare(b.name));
const myP=id=>S.progress[S.me+"__"+id]||null;
const isFav=id=>!!(myP(id)&&myP(id).fav);
const myAt=id=>(myP(id)&&Number(myP(id).at))||0;
const ratingsFor=(tid,pid)=>Object.values(S.ratings).filter(r=>r.tid===tid&&(!pid||r.person===pid));
const avg=a=>a.length?a.reduce((s,r)=>s+Number(r.score),0)/a.length:null;
const people=()=>{const s=new Set(Object.keys(S.people));if(S.me)s.add(S.me);return [...s].sort((a,b)=>(a===S.me?-1:b===S.me?1:nameOf(a).localeCompare(nameOf(b))))};
const nameOf=pid=>(S.people[pid]&&S.people[pid].name)||"Someone";
const colorOf=pid=>(S.people[pid]&&S.people[pid].color)||"var(--sunk)";
function isNew(t){const p=proj(t);const at=myAt(t.id);return (isFav(t.id)||at>0)&&p.latest>at&&t.format!=="MOVIE"}
function scoreColor(v){if(v==null)return "";const h=Math.round((v-1)/9*120);return `background:hsl(${h} 55% 50% / .18)`}
const onBoard=aid=>Object.values(S.titles).find(t=>t.anilist===aid);

/* ---------- render helpers ---------- */
function cover(t,cls){const fav=t.id&&isFav(t.id)?'<span class="stamp" title="Favorite">推</span>':"";
  const ph=`<div class="ph" style="background:${esc(t.color||"#5b6478")}">${esc((t.name||"?").trim()[0]||"?")}</div>`;
  return `<div class="cv ${cls||""}">${ph}${t.cover?`<img src="${esc(t.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" style="position:relative" onerror="this.remove()">`:""}${fav}</div>`}
function statusChip(t){const lab={airing:t.kind==="anime"?"Airing":"Ongoing",upcoming:"Upcoming",hiatus:"Hiatus",finished:"Finished"}[t.status]||t.status;return `<span class="chip ${t.status==="airing"?"airing":t.status==="hiatus"?"hiatus":""}">${esc(lab)}</span>`}
const kindLabel=t=>t.kind==="anime"?(t.format==="MOVIE"?"Movie":"Anime"):t.kind==="novel"?"Novel":(t.format==="MANHUA"?"Manhua":t.format==="MANHWA"?"Manhwa":"Manga");
const kindChip=t=>`<span class="chip ${t.kind==="anime"?"anime":""}">${kindLabel(t)}</span>`;
const avatar=(pid,size)=>`<span class="avatar" style="background:${esc(colorOf(pid))};color:#fff;${size?`width:${size}px;height:${size}px;font-size:${Math.round(size*.42)}px`:""}">${esc(nameOf(pid)[0]||"?")}</span>`;

function render(){
  const top=$("#top"),m=$("#main");
  if(!S.key||S.locked){top.hidden=true;$("#layer").innerHTML="";m.innerHTML=`<div class="gate"><div class="box"><span class="k">次回</span><h1>This board is private</h1><p class="muted">Open Jikai from the link you were sent. The link has the key that lets you in.</p></div></div>`;return}
  if(!S.loaded){top.hidden=true;m.innerHTML=S.online?`<div class="loading"><span class="k">次回</span>Loading your board…</div>`:`<div class="gate"><div class="box"><span class="k">次回</span><h1>Can't reach the board</h1><p class="muted">Check your internet connection, then try again.</p><button class="btn primary" data-act="retry">Try again</button></div></div>`;return}
  if(!S.me||!S.people[S.me]){top.hidden=true;$("#layer").innerHTML="";m.innerHTML=whoView();return}
  top.hidden=false;
  document.querySelectorAll(".tab").forEach(b=>b.setAttribute("aria-current",b.dataset.tab===S.tab?"page":"false"));
  $("#me").innerHTML=`${avatar(S.me)}<span class="nm">${esc(nameOf(S.me))}</span>`;
  const off=S.online?"":`<div class="notice">You're offline. Changes won't save until you're back online.</div>`;
  if(!Object.keys(S.titles).length&&S.tab!=="library"){m.innerHTML=off+`<div class="loading"><span class="k">棚</span>Nothing on the board yet.<div style="margin-top:14px"><button class="btn primary" data-act="add">Find a title</button></div></div>`;renderSheet();return}
  m.innerHTML=off+({feed:feedView,calendar:calView,library:libView,friends:friendsView}[S.tab]||feedView)();
  renderSheet();
}
function whoView(){const ps=Object.keys(S.people);
  return `<div class="gate"><div class="box"><span class="k">友</span><h1>Who's watching?</h1><p class="muted">Pick your name. Your progress, favorites and scores are saved under it.</p>
  <div class="who">${ps.map(p=>`<button data-act="iam" data-id="${esc(p)}">${avatar(p,30)}${esc(nameOf(p))}</button>`).join("")}</div>
  <form class="newperson" id="newPerson"><input id="np_name" placeholder="New here? Type your name" maxlength="40" aria-label="Your name"><button class="btn primary" type="submit">Join</button></form></div></div>`}

function feedView(){
  const td=today();const all=list();
  const ups=all.map(t=>({t,p:proj(t)})).filter(x=>x.p.next);
  ups.sort((a,b)=>(isFav(b.t.id)-isFav(a.t.id))||a.p.next.date.localeCompare(b.p.next.date));
  const favUps=ups.filter(x=>isFav(x.t.id)).sort((a,b)=>a.p.next.date.localeCompare(b.p.next.date));
  const heroX=favUps[0]||ups.slice().sort((a,b)=>a.p.next.date.localeCompare(b.p.next.date))[0];
  let h="";
  if(heroX){const {t,p}=heroX;const n=diff(td,p.next.date);
    h+=`<button class="hero" data-open="${esc(t.id)}">${cover(t)}<div style="min-width:0"><div class="eyebrow">${favUps[0]?"Next of your favorites":"Next release on the board"}</div><h1>${esc(t.name)}</h1><div class="what">${esc(unit(t))} ${p.next.n} ${p.next.est?'<span class="est">estimated</span>':""}</div><div class="muted" style="font-size:13px;margin-top:4px">${esc(fmtLong(p.next.date))}</div></div>
    <div class="count">${n===0?`<div class="num">今日</div><div class="day">Out today</div>`:`<div class="ato">あと</div><div class="num">${n}</div><div class="unit">日</div><div class="day">${n===1?"day":"days"} to go</div>`}</div></button>`}
  const news=all.filter(isNew).sort((a,b)=>isFav(b.id)-isFav(a.id));
  if(news.length){h+=`<section class="sec"><div class="sec-h"><span class="k">新</span><h2>Out now for you</h2><span class="sub">Released past where you are</span></div><div class="strip">${news.map(t=>{const p=proj(t);const at=myAt(t.id);return `<div class="newcard"><button style="all:unset;cursor:pointer;display:contents" data-open="${esc(t.id)}">${cover(t)}<div class="info"><div class="t">${esc(t.name)}</div><div class="muted" style="font-size:13px"><span class="newmark">NEW</span>${esc(unit(t))} ${p.latest} out · you're on ${at}</div></div></button><button class="plus" data-act="inc" data-id="${esc(t.id)}" aria-label="Mark next ${esc(unitWord(t))} as seen">+1</button></div>`}).join("")}</div></section>`}
  const soon=ups.filter(x=>diff(td,x.p.next.date)<=45);
  h+=`<section class="sec"><div class="sec-h"><span class="k">次</span><h2>Coming up</h2><span class="sub">Favorites first, then by date</span></div>`;
  h+=soon.length?`<div class="rows">${soon.map(({t,p})=>row(t,`${esc(unit(t))} ${p.next.n}`,p.next.date,p.next.est)).join("")}</div>`:`<div class="notice">Nothing dated in the next six weeks.</div>`;
  h+=`</section>`;
  const later=ups.filter(x=>diff(td,x.p.next.date)>45);
  const wait=all.filter(t=>!proj(t).next&&t.status!=="finished");
  if(later.length||wait.length){h+=`<section class="sec"><div class="sec-h"><span class="k">待</span><h2>Waiting for news</h2><span class="sub">Breaks, hiatuses and announced-but-undated</span></div><div class="rows">${later.map(({t,p})=>row(t,`${esc(unit(t))} ${p.next.n}${t.note?" · "+esc(t.note):""}`,p.next.date,p.next.est)).join("")}${wait.map(t=>row(t,esc(t.window||t.note||"No date announced"),null)).join("")}</div></section>`}
  h+=`<div class="sync ${S.online?"":"off"}" style="margin-top:24px"><span class="d"></span>${S.syncedAt?"Schedules checked with AniList just now":"Anime schedules refresh from AniList each time you open the app"}</div>`;
  return h;
}
function row(t,what,date,est){
  return `<button class="row" data-open="${esc(t.id)}">${cover(t)}<div style="min-width:0"><div class="t">${esc(t.name)}</div><div class="m">${kindChip(t)} <span>${what}</span></div></div><div class="when">${date?`<b>${esc(fmt(date))}</b><span>${esc(rel(date))}${est?" · est.":""}</span>`:`<b>${t.window?esc(t.window):"TBA"}</b><span>${t.status==="hiatus"?"On hiatus":"Not dated"}</span>`}</div></button>`}
function calView(){
  const td=today();const end=addDays(td,13);const ev={};
  list().forEach(t=>occurrences(t,td,end).forEach(o=>{(ev[o.date]=ev[o.date]||[]).push({t,o})}));
  let h=`<section class="sec"><div class="sec-h"><span class="k">暦</span><h2>Next 14 days</h2><span class="sub">Danish dates · est. means estimated</span></div><div class="cal">`;
  for(let i=0;i<14;i++){const d=addDays(td,i);const items=(ev[d]||[]).sort((a,b)=>isFav(b.t.id)-isFav(a.t.id));const wd=dow(d);
    h+=`<div class="day ${d===td?"today":""} ${wd===0||wd===6?"weekend":""} ${items.length?"":"none"}"><h3><span>${esc(fmt(d))}</span><span class="kj">${KANJI[wd]}</span></h3>${items.length?items.map(({t,o})=>`<button class="ev ${isFav(t.id)?"fav":""}" data-open="${esc(t.id)}"><span class="bar" style="background:${esc(t.color||"var(--accent)")}"></span><span style="min-width:0">${esc(t.name)}<span class="n">${esc(unit(t))} ${o.n}${o.est?" · est.":""}</span></span></button>`).join(""):`<div class="empty-day">—</div>`}</div>`}
  return h+`</div></section>`;
}
function aniResults(res,busy,q){
  if(busy&&!res.length)return `<div class="muted" style="margin-top:12px">Searching AniList…</div>`;
  if(!res.length)return q?`<div class="muted" style="margin-top:12px">No matches on AniList for “${esc(q)}”. You can add it by hand instead.</div>`:"";
  return `<div class="results">${res.map(m=>{const ex=onBoard(m.id);const fake={name:aniName(m),cover:m.coverImage&&m.coverImage.large,color:m.coverImage&&m.coverImage.color,kind:aniKind(m),format:aniFormat(m)};
    const yr=(m.startDate&&m.startDate.year)||m.seasonYear||"";const tot=m.type==="ANIME"?(m.episodes?m.episodes+" eps":""):(m.chapters?m.chapters+" ch":"");
    return `<div class="res">${cover(fake)}<div style="min-width:0"><div class="t">${esc(fake.name)}</div><div class="m">${esc(kindLabel(fake))}${m.format&&m.format!=="MANGA"&&m.format!=="TV"?" · "+esc(m.format.replace("_"," ")):""}${yr?" · "+yr:""}${tot?" · "+tot:""} · ${esc({RELEASING:"Releasing",FINISHED:"Finished",NOT_YET_RELEASED:"Upcoming",HIATUS:"Hiatus",CANCELLED:"Cancelled"}[m.status]||"")}</div></div>${ex?`<button class="btn ghost" data-open="${esc(ex.id)}">On board</button>`:`<button class="btn primary" data-act="addani" data-aid="${m.id}">＋ Add</button>`}</div>`}).join("")}</div>`}
function libView(){
  const q=S.q.trim().toLowerCase();
  const F={all:()=>true,fav:t=>isFav(t.id),anime:t=>t.kind==="anime",read:t=>t.kind!=="anime",airing:t=>t.status==="airing",upcoming:t=>t.status==="upcoming",hiatus:t=>t.status==="hiatus",finished:t=>t.status==="finished"};
  const items=list().filter(F[S.filter]||F.all).filter(t=>!q||(t.name+" "+(t.series||"")).toLowerCase().includes(q));
  const chips=[["all","All"],["fav","推 Favorites"],["anime","Anime"],["read","Manga & novels"],["airing","Airing"],["upcoming","Upcoming"],["hiatus","Hiatus"],["finished","Finished"]];
  let h=`<div class="tools"><label class="search"><span class="muted" aria-hidden="true">⌕</span><input id="q" type="search" placeholder="Search your board and all of AniList" value="${esc(S.q)}" aria-label="Search titles" autocomplete="off"></label><button class="btn primary" data-act="add">＋ Add title</button></div>
  <div class="filters" style="margin-top:10px">${chips.map(([k,l])=>`<button class="fchip" data-filter="${k}" aria-pressed="${S.filter===k}">${esc(l)}</button>`).join("")}</div>`;
  if(q.length>=2)h+=`<section class="ani-sec"><div class="sec-h"><span class="k">探</span><h2>From AniList</h2><span class="sub">Every anime and manga, whether it's on your board or not</span></div>${aniResults(S.libAni.res,S.libAni.busy,S.libAni.q)}</section>`;
  if(!items.length){h+=q?`<div class="muted" style="margin-top:24px">Nothing on your board matches “${esc(S.q)}”.</div>`:`<div class="nomatch"><b>No titles match this filter.</b></div>`;return h}
  if(q.length>=2)h+=`<div class="sec-h" style="margin-top:28px"><span class="k">棚</span><h2>On your board</h2></div>`;
  const groups={};items.forEach(t=>{(groups[t.series||t.name]=groups[t.series||t.name]||[]).push(t)});
  Object.keys(groups).sort().forEach(g=>{const ts=groups[g];
    h+=`<h2 class="series-h">${esc(g)} <small>${ts.length} ${ts.length===1?"title":"titles"}</small></h2><div class="grid">${ts.map(t=>{const p=proj(t);const at=myAt(t.id);const pct=p.latest?Math.min(100,at/p.latest*100):0;
      return `<button class="card" data-open="${esc(t.id)}">${cover(t)}<div class="t">${esc(t.name)}</div><div class="m">${kindChip(t)} ${p.next?`${esc(unit(t))} ${p.next.n} · ${esc(fmt(p.next.date))}`:esc(t.status==="finished"?(p.latest?p.latest+" "+unitWord(t)+"s":"Finished"):(t.window||"TBA"))}</div>${at?`<div class="pbar" title="You're at ${at} of ${p.latest}"><i style="width:${pct}%"></i></div>`:""}</button>`}).join("")}</div>`});
  return h;
}
function friendsView(){
  const ps=people();
  let h=`<section class="sec"><div class="sec-h"><span class="k">友</span><h2>Everyone on the board</h2></div><div class="people">`;
  ps.forEach(u=>{const rs=Object.values(S.ratings).filter(r=>r.person===u);const prog=Object.values(S.progress).filter(p=>p.person===u);const a=avg(rs);
    const recent=rs.slice().sort((x,y)=>(y.ts||0)-(x.ts||0)).slice(0,5);
    h+=`<div class="person"><div class="hd">${avatar(u,36)}<div><b>${esc(nameOf(u))}</b>${u===S.me?' <span class="muted" style="font-size:12px">you</span>':""}</div></div>
    <div class="stats"><div><b>${prog.filter(p=>p.at>0).length}</b><span>titles going</span></div><div><b>${prog.filter(p=>p.fav).length}</b><span>favorites</span></div><div><b>${rs.length}</b><span>ratings</span></div><div><b>${a==null?"–":a.toFixed(1)}</b><span>avg score</span></div></div>
    <div class="act-list">${recent.length?recent.map(r=>{const t=S.titles[r.tid];return t?`<div><span class="tt">${esc(t.name)} · ${esc(unit(t))} ${r.n}</span><span class="score" style="${scoreColor(r.score)}">${r.score}</span></div>`:""}).join(""):`<span class="muted">No ratings yet.</span>`}</div></div>`});
  h+=`</div></section>`;
  h+=`<section class="sec"><div class="sec-h"><span class="k">鍵</span><h2>Invite a friend</h2><span class="sub">Anyone with this link can open and edit the board</span></div><div class="linkbox"><input id="shareLink" readonly value="${esc(shareLink())}" aria-label="Board link"><button class="btn" data-act="copy">Copy link</button></div></section>`;
  const tids=[...new Set(Object.values(S.ratings).map(r=>r.tid))].filter(id=>S.titles[id]);
  if(tids.length){h+=`<section class="sec"><div class="sec-h"><span class="k">評</span><h2>Ratings side by side</h2><span class="sub">Average score per title</span></div><div class="tablewrap"><table><thead><tr><th>Title</th>${ps.map(u=>`<th class="n">${esc(nameOf(u))}</th>`).join("")}<th class="n">All</th></tr></thead><tbody>${tids.map(id=>{const t=S.titles[id];return `<tr><td><button style="all:unset;cursor:pointer" data-open="${esc(id)}">${esc(t.name)}</button></td>${ps.map(u=>{const v=avg(ratingsFor(id,u));return `<td class="n">${v==null?'<span class="muted">–</span>':`<span class="score" style="${scoreColor(v)}">${v.toFixed(1)}</span>`}</td>`}).join("")}<td class="n">${(()=>{const v=avg(ratingsFor(id));return `<span class="score" style="${scoreColor(v)}">${v.toFixed(1)}</span>`})()}</td></tr>`}).join("")}</tbody></table></div></section>`}
  return h;
}
const shareLink=()=>location.origin+location.pathname+"?k="+encodeURIComponent(S.key);

/* ---------- sheets ---------- */
function renderSheet(){
  const L=$("#layer");
  if(S.open==="chat"){if(!$("#chatSheet"))L.innerHTML=`<div class="scrim" data-act="close"></div><aside class="sheet chatsheet" id="chatSheet" role="dialog" aria-label="Ask Claude">${chatHtml()}</aside>`;else renderMsgs();return}
  if(!S.open){L.innerHTML="";return}
  const ae=document.activeElement;
  if(S.sheetFor===S.open&&ae&&ae.closest&&ae.closest("#sheet")&&/^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)&&ae.id!=="aniQ"){return}
  if(S.open==="add"&&S.sheetFor==="add"&&$("#aniResults")){$("#aniResults").innerHTML=aniResults(S.ani.res,S.ani.busy,S.ani.q);$("#aniSeg").innerHTML=segHtml();return}
  S.sheetFor=S.open;
  const html=S.open==="add"?addHtml():S.open==="manual"?manualHtml():detailHtml(S.titles[S.open]);
  if(!html){S.open=null;L.innerHTML="";return}
  const prevScroll=$("#sheet")?$("#sheet").scrollTop:0;
  L.innerHTML=`<div class="scrim" data-act="close"></div><aside class="sheet" id="sheet" role="dialog" aria-modal="true"><button class="btn ghost sheet-close" data-act="close" aria-label="Close">✕ Close</button>${html}</aside>`;
  $("#sheet").scrollTop=prevScroll;
}
const segHtml=()=>[["ANIME","Anime"],["MANGA","Manga & novels"],["BOTH","Both"]].map(([k,l])=>`<button type="button" data-act="anitype" data-v="${k}" aria-pressed="${S.ani.type===k}">${l}</button>`).join("");
function addHtml(){return `<h2 style="font-family:var(--f-disp);font-weight:800;font-size:24px;clear:both">Add a title</h2><p class="muted" style="font-size:14px">Search all of AniList. Adding a title brings its cover, episodes and air dates with it.</p>
  <label class="search" style="margin-top:10px"><span class="muted" aria-hidden="true">⌕</span><input id="aniQ" type="search" placeholder="e.g. Kaiju No. 8, Frieren, Chainsaw Man" value="${esc(S.ani.q)}" autocomplete="off" aria-label="Search AniList"></label>
  <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:10px"><div class="seg" id="aniSeg">${segHtml()}</div><button class="btn ghost" data-act="manual">Add by hand instead</button></div>
  <div id="aniResults">${aniResults(S.ani.res,S.ani.busy,S.ani.q)}</div>`}
function manualHtml(){return `<h2 style="font-family:var(--f-disp);font-weight:800;font-size:24px;clear:both">Add by hand</h2><p class="muted" style="font-size:14px">For things AniList doesn't have. You can edit everything later.</p>
  <form class="form" id="addForm">
  <label class="full">Name<input id="a_name" required value="${esc(S.ani.q)}"></label>
  <label>Type<select id="a_kind"><option value="anime">Anime</option><option value="manga">Manga / manhwa / manhua</option><option value="novel">Light novel</option></select></label>
  <label>Series (groups it in the library)<input id="a_series" placeholder="Optional"></label>
  <label>Latest released<input id="a_latest" type="number" min="0" value="0"></label>
  <label>Status<select id="a_status"><option>airing</option><option>upcoming</option><option>hiatus</option><option>finished</option></select></label>
  <label>Next number<input id="a_nextn" type="number" min="0"></label>
  <label>Next date<input id="a_nextd" type="date"></label>
  <label>Repeats<select id="a_cad"><option value="">No</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
  <label>Favorite<select id="a_fav"><option value="1">Yes, pin it</option><option value="0">No</option></select></label>
  <div class="formbtns" style="grid-column:1/-1"><button class="btn primary" type="submit">Add to board</button><button class="btn ghost" type="button" data-act="add">Back to search</button></div></form>`}
function detailHtml(t){
  if(!t)return "";const p=proj(t);const at=myAt(t.id);const fav=isFav(t.id);
  let h=`<div class="dt-head">${cover(t)}<div style="min-width:0"><div class="muted" style="font-size:13px">${esc(t.series||"")}</div><h2>${esc(t.name)}</h2><div class="dt-meta">${kindChip(t)}${statusChip(t)}${(t.genres||[]).map(g=>`<span class="chip">${esc(g)}</span>`).join("")}</div>
  <dl class="kv"><dt>Next</dt><dd>${p.next?`<b>${esc(unit(t))} ${p.next.n}</b> · ${esc(fmt(p.next.date))} <span class="muted">(${esc(rel(p.next.date))})</span>${p.next.est?'<span class="est">estimated</span>':""}`:esc(t.window||(t.status==="finished"?"Complete":"Not announced"))}</dd>
  <dt>Released</dt><dd>${p.latest?`${esc(unit(t))} ${p.latest}${t.total?` of ${t.total}`:""}`:"Nothing yet"}${p.latestDate?` <span class="muted">· ${esc(fmt(p.latestDate))}</span>`:""}</dd>
  ${t.cadence?`<dt>Schedule</dt><dd>${t.cadence==="weekly"?"Weekly":"Monthly"}${t.breaks&&t.breaks.filter(b=>b>=today()).length?` · breaks ${t.breaks.filter(b=>b>=today()).map(fmt).join(", ")}`:""}</dd>`:""}
  ${t.note?`<dt>Note</dt><dd>${esc(t.note)}</dd>`:""}
  ${t.anilist?`<dt>AniList</dt><dd><a href="https://anilist.co/${t.kind==="anime"?"anime":"manga"}/${t.anilist}" target="_blank" rel="noopener" style="color:var(--accent)">Open page</a></dd>`:""}</dl></div></div>`;
  h+=`<div class="block"><button class="favbtn" data-act="fav" data-id="${esc(t.id)}" aria-pressed="${fav}"><span class="s">推</span>${fav?"Favorite":"Add to favorites"}</button></div>`;
  h+=`<div class="block"><h3>Your progress</h3><div class="stepper"><button class="btn" data-act="dec" data-id="${esc(t.id)}" aria-label="One back">−</button><input id="atInput" type="number" min="0" value="${at}" aria-label="${esc(unitWord(t))} you are at"><button class="btn" data-act="inc" data-id="${esc(t.id)}" aria-label="One forward">＋</button><span class="muted">${at?`You're at ${esc(unit(t))} ${at}`:"Not started"}${p.latest?` · ${Math.max(0,p.latest-at)} to catch up`:""}</span></div>`;
  const maxN=Math.max(p.latest,at,t.format==="MOVIE"?1:0);
  if(maxN>0){const per=60;const pages=Math.ceil(maxN/per);const pg=Math.min(S.epPage,pages-1);const hi=maxN-pg*per;const lo=Math.max(1,hi-per+1);
    const mineR={};ratingsFor(t.id,S.me).forEach(r=>mineR[r.n]=r.score);
    h+=`<div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px;gap:8px;flex-wrap:wrap"><span class="muted" style="font-size:13px">Tap a ${esc(unitWord(t))} to rate it</span>${pages>1?`<span><button class="btn ghost" data-act="pg" data-d="1" ${pg>=pages-1?"disabled":""}>‹ Older</button><button class="btn ghost" data-act="pg" data-d="-1" ${pg<=0?"disabled":""}>Newer ›</button></span>`:""}</div><div class="eps">`;
    for(let n=lo;n<=hi;n++)h+=`<button class="ep ${n<=at?"seen":""} ${S.sel===n?"sel":""}" data-act="sel" data-n="${n}" aria-label="${esc(unitWord(t))} ${n}">${n}<span class="r">${mineR[n]!=null?"★"+mineR[n]:""}</span></button>`;
    if(p.next&&pg===0)h+=`<span class="ep up" title="${esc(fmt(p.next.date))}">${p.next.n}<span class="r">${esc(fmt(p.next.date).split(" ").slice(1).join(" "))}</span></span>`;
    h+=`</div>`;
    if(S.sel){const n=S.sel;const mine=ratingsFor(t.id,S.me).find(r=>r.n===n);const others=ratingsFor(t.id).filter(r=>r.n===n&&r.person!==S.me);
      h+=`<div class="ratebox"><b>${esc(unit(t))} ${n}</b> <span class="muted">· your score</span><div class="rate">${[1,2,3,4,5,6,7,8,9,10].map(v=>`<button data-act="rate" data-n="${n}" data-v="${v}" aria-pressed="${!!(mine&&mine.score===v)}">${v}</button>`).join("")}</div>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn" data-act="seenTo" data-n="${n}">Mark seen up to ${n}</button>${others.map(r=>`<span class="btn ghost" style="cursor:default">${esc(nameOf(r.person))}: <span class="score" style="${scoreColor(r.score)}">${r.score}</span></span>`).join("")}</div></div>`}
  }
  h+=`</div>`;
  const ps=people();
  h+=`<div class="block"><h3>Scores &amp; progress</h3><div class="avg">${ps.map(u=>{const v=avg(ratingsFor(t.id,u));return `<div><span class="muted">${esc(nameOf(u))}</span><b>${v==null?"–":v.toFixed(1)}</b><span class="muted">${ratingsFor(t.id,u).length} rated · at ${(S.progress[u+"__"+t.id]||{}).at||0}</span></div>`}).join("")}<div><span class="muted">Together</span><b>${(()=>{const v=avg(ratingsFor(t.id));return v==null?"–":v.toFixed(1)})()}</b></div>${t.score?`<div><span class="muted">AniList</span><b>${(t.score/10).toFixed(1)}</b></div>`:""}</div></div>`;
  h+=`<div class="block"><details ${S.editOpen?"open":""} id="editDetails"><summary style="cursor:pointer;font-weight:700">Edit release info</summary>${editForm(t)}</details></div>`;
  return h;
}
function editForm(t){const p=t.next||{};
  return `<form class="form" id="editForm" data-id="${esc(t.id)}" style="margin-top:12px">
  <label class="full">Name<input id="f_name" value="${esc(t.name)}"></label>
  <label class="full">Series<input id="f_series" value="${esc(t.series||"")}" list="seriesList"><datalist id="seriesList">${[...new Set(list().map(x=>x.series))].map(s=>`<option value="${esc(s)}">`).join("")}</datalist></label>
  <label>Latest released<input id="f_latest" type="number" min="0" value="${esc(t.latest||0)}"></label>
  <label>Status<select id="f_status">${["airing","upcoming","hiatus","finished"].map(s=>`<option ${t.status===s?"selected":""}>${s}</option>`).join("")}</select></label>
  <label>Next number<input id="f_nextn" type="number" min="0" value="${esc(p.n||"")}"></label>
  <label>Next date<input id="f_nextd" type="date" value="${esc(p.date||"")}"></label>
  <label>Repeats<select id="f_cad"><option value="">No</option><option value="weekly" ${t.cadence==="weekly"?"selected":""}>Weekly</option><option value="monthly" ${t.cadence==="monthly"?"selected":""}>Monthly</option></select></label>
  <label>Window if undated<input id="f_win" value="${esc(t.window||"")}" placeholder="e.g. Spring 2027"></label>
  <label class="full">Note<input id="f_note" value="${esc(t.note||"")}"></label>
  <div class="formbtns" style="grid-column:1/-1"><button class="btn primary" type="submit">Save changes</button>${S.confirmDel===t.id?`<button class="btn danger" type="button" data-act="del" data-id="${esc(t.id)}">Yes, remove it</button><button class="btn ghost" type="button" data-act="nodel">Keep it</button>`:`<button class="btn ghost" type="button" data-act="askdel" data-id="${esc(t.id)}">Remove from board</button>`}</div>
  ${t.anilist&&t.kind!=="anime"?`<p class="muted" style="grid-column:1/-1;font-size:12px;margin:0">AniList has no chapter dates, so set the next chapter here. Weekly and monthly ones roll forward on their own.</p>`:""}</form>`}

/* ---------- writes ---------- */
function toast(msg){const h=$("#toastHost");h.innerHTML=`<div class="toast" role="status">${esc(msg)}</div>`;clearTimeout(toast.t);toast.t=setTimeout(()=>h.innerHTML="",2600)}
async function guard(fn,ok){try{await fn();S.online=true;if(ok)toast(ok);return true}catch(e){if(e.locked){S.locked=true;render();return false}toast("Couldn't save. Check your connection and try again.");return false}}
function saveProgress(tid,patch){const id=S.me+"__"+tid;const cur=S.progress[id]||{person:S.me,tid,at:0,fav:false};const nx=Object.assign({},cur,patch,{person:S.me,tid,ts:Date.now()});S.progress[id]=nx;render();return guard(()=>rpc("jk_put_progress",{pid:S.me,t:tid,a:nx.at,f:nx.fav}))}
const setAt=(tid,n)=>saveProgress(tid,{at:Math.max(0,Math.floor(Number(n)||0))});
const setFav=(tid,on)=>saveProgress(tid,{fav:!!on});
function rate(tid,n,v){const id=S.me+"__"+tid+"__"+n;const cur=S.ratings[id];
  if(v==null||(cur&&cur.score===v)){delete S.ratings[id];render();return guard(()=>rpc("jk_put_rating",{pid:S.me,t:tid,num:Number(n),s:null}))}
  S.ratings[id]={person:S.me,tid,n:Number(n),score:Number(v),ts:Date.now()};render();return guard(()=>rpc("jk_put_rating",{pid:S.me,t:tid,num:Number(n),s:Number(v)}))}
function cleanTitle(f){const t={};["name","series","kind","format","status","window","note","cadence"].forEach(k=>{if(f[k]!=null)t[k]=String(f[k])});
  if(f.latest!=null)t.latest=Math.max(0,Number(f.latest)||0);if(f.total!=null)t.total=Number(f.total)||null;
  if(f.nextNum!==undefined||f.nextDate!==undefined){t.next=f.nextNum&&f.nextDate?{n:Number(f.nextNum),date:String(f.nextDate),est:!!f.estimated}:null}
  if(Array.isArray(f.breaks))t.breaks=f.breaks.map(String);return t}
function putTitle(t){const {id,...d}=t;return guard(()=>rpc("jk_put_title",{tid:id,d}))}
function updateTitle(id,f){const t=S.titles[id];if(!t)throw new Error("No title with id "+id);Object.assign(t,cleanTitle(f),{updated:new Date().toISOString()});render();return putTitle(t)}
function newId(){return "u"+Date.now().toString(36)+Math.random().toString(36).slice(2,5)}
async function addTitle(f){const id=newId();const t=Object.assign({id,kind:"anime",status:"upcoming",latest:0,source:"Added by hand",updated:new Date().toISOString(),addedBy:S.me},cleanTitle(f));if(!t.series)t.series=t.name;S.titles[id]=t;render();return (await putTitle(t))?id:null}
async function addFromAni(m,fav){const ex=onBoard(m.id);if(ex){if(fav)await setFav(ex.id,true);return ex.id}
  const id=(m.type==="ANIME"?"a":"m")+m.id;const t=fromAni(m,{id,addedBy:S.me});t.id=id;
  const sib=list().find(x=>x.series&&(t.name.toLowerCase().startsWith(x.series.toLowerCase())));if(sib)t.series=sib.series;
  S.titles[id]=t;render();const ok=await putTitle(t);if(ok&&fav!==false)await setFav(id,true);return ok?id:null}
function removeTitle(id){delete S.titles[id];S.open=null;S.confirmDel=null;Object.keys(S.progress).forEach(k=>{if(k.endsWith("__"+id))delete S.progress[k]});render();return guard(()=>rpc("jk_del_title",{tid:id}),"Removed from the board")}
function applyAccent(){const a=ACCENTS[S.settings.accent]||null;let st=document.getElementById("accentStyle");if(!st){st=document.createElement("style");st.id="accentStyle";document.head.appendChild(st)}
  st.textContent=a?`:root{--accent:${a.l[0]};--accent-soft:${a.l[1]}}@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--accent:${a.d[0]};--accent-soft:${a.d[1]}}}:root[data-theme="dark"]{--accent:${a.d[0]};--accent-soft:${a.d[1]}}`:""}

/* ---------- search (debounced) ---------- */
let aniT,libT;
function runAddSearch(){clearTimeout(aniT);const q=S.ani.q.trim();if(q.length<2){S.ani.res=[];S.ani.busy=false;renderSheet();return}
  S.ani.busy=true;renderSheet();aniT=setTimeout(async()=>{const my=q+"|"+S.ani.type;try{const r=await aniSearch(q,S.ani.type);if(my===S.ani.q.trim()+"|"+S.ani.type){S.ani.res=r}}catch(_){S.ani.res=[]}S.ani.busy=false;renderSheet()},350)}
function runLibSearch(){clearTimeout(libT);const q=S.q.trim();if(q.length<2){S.libAni={q:"",res:[],busy:false};return}
  S.libAni.busy=true;libT=setTimeout(async()=>{try{const r=await aniSearch(q,"BOTH");if(q===S.q.trim()){S.libAni={q,res:r,busy:false};keepFocus(render)}}catch(_){S.libAni={q,res:[],busy:false};keepFocus(render)}},400)}
function keepFocus(fn){const a=document.activeElement;const id=a&&a.id;const pos=a&&a.selectionStart;fn();if(id){const el=document.getElementById(id);if(el){el.focus();try{el.setSelectionRange(pos,pos)}catch(_){}}}}

/* ---------- events ---------- */
document.addEventListener("click",async e=>{
  const tab=e.target.closest("[data-tab]");if(tab){location.hash=tab.dataset.tab;return}
  const op=e.target.closest("[data-open]");if(op){S.open=op.dataset.open;S.sel=null;S.epPage=0;S.confirmDel=null;S.editOpen=false;render();return}
  const fc=e.target.closest("[data-filter]");if(fc){S.filter=fc.dataset.filter;render();return}
  const a=e.target.closest("[data-act]");if(!a)return;const act=a.dataset.act;const id=a.dataset.id||S.open;
  if(act==="close"){S.open=null;render();return}
  if(act==="retry"){S.online=true;render();load();return}
  if(act==="who"){S.me=null;ls.del("jikai.me");render();return}
  if(act==="iam"){S.me=a.dataset.id;ls.set("jikai.me",S.me);render();return}
  if(act==="chat"){S.open="chat";render();setTimeout(()=>$("#chatIn")&&$("#chatIn").focus(),50);return}
  if(act==="add"){S.open="add";S.sheetFor=null;render();setTimeout(()=>$("#aniQ")&&$("#aniQ").focus(),50);if(S.ani.q)runAddSearch();return}
  if(act==="manual"){S.open="manual";render();return}
  if(act==="anitype"){S.ani.type=a.dataset.v;runAddSearch();return}
  if(act==="addani"){const aid=Number(a.dataset.aid);const m=[...S.ani.res,...S.libAni.res].find(x=>x.id===aid);if(!m)return;a.disabled=true;a.textContent="Adding…";const nid=await addFromAni(m,true);if(nid){toast("Added "+aniName(m)+" to your favorites");S.open=nid;S.sel=null;S.epPage=0;render()}return}
  if(act==="inc"){await setAt(id,myAt(id)+1);if(e.target.closest(".newcard"))toast(`Marked ${unit(S.titles[id])} ${myAt(id)} as seen`);return}
  if(act==="dec"){setAt(id,myAt(id)-1);return}
  if(act==="fav"){setFav(id,!isFav(id));return}
  if(act==="sel"){const n=Number(a.dataset.n);S.sel=S.sel===n?null:n;render();return}
  if(act==="rate"){rate(S.open,Number(a.dataset.n),Number(a.dataset.v));return}
  if(act==="seenTo"){setAt(S.open,Number(a.dataset.n));return}
  if(act==="pg"){S.epPage=Math.max(0,S.epPage+Number(a.dataset.d));S.sel=null;render();return}
  if(act==="askdel"){S.confirmDel=id;S.editOpen=true;render();return}
  if(act==="nodel"){S.confirmDel=null;render();return}
  if(act==="del"){removeTitle(id);return}
  if(act==="copy"){const v=shareLink();try{await navigator.clipboard.writeText(v);toast("Link copied")}catch(_){const i=$("#shareLink");i.select();toast("Select and copy the link")}return}
  if(act==="sugg"){sendChat(a.textContent);return}
  if(act==="stop"){S.abort&&S.abort.abort();return}
});
document.addEventListener("toggle",e=>{if(e.target.id==="editDetails")S.editOpen=e.target.open},true);
document.addEventListener("input",e=>{
  if(e.target.id==="q"){S.q=e.target.value;runLibSearch();keepFocus(render)}
  if(e.target.id==="aniQ"){S.ani.q=e.target.value;runAddSearch()}
});
document.addEventListener("change",e=>{if(e.target.id==="atInput"){setAt(S.open,e.target.value);e.target.blur()}});
document.addEventListener("submit",async e=>{e.preventDefault();const f=e.target;if(f.id!=="chatForm"&&document.activeElement)document.activeElement.blur();const v=id=>(document.getElementById(id)||{}).value;
  if(f.id==="newPerson"){const name=v("np_name").trim();if(!name)return;const pid="p"+Date.now().toString(36);const color=COLORS[Object.keys(S.people).length%COLORS.length];
    if(await guard(()=>rpc("jk_put_person",{pid,pname:name,pcolor:color}))){S.people[pid]={id:pid,name,color};S.me=pid;ls.set("jikai.me",pid);render()}}
  if(f.id==="editForm"){if(await updateTitle(f.dataset.id,{name:v("f_name"),series:v("f_series"),latest:v("f_latest"),status:v("f_status"),nextNum:v("f_nextn")||null,nextDate:v("f_nextd")||null,cadence:v("f_cad"),window:v("f_win"),note:v("f_note")}))toast("Saved")}
  if(f.id==="addForm"){const name=v("a_name").trim();if(!name){toast("Give the title a name first.");return}
    const nid=await addTitle({name,kind:v("a_kind"),series:v("a_series").trim()||name,latest:v("a_latest"),status:v("a_status"),nextNum:v("a_nextn")||null,nextDate:v("a_nextd")||null,cadence:v("a_cad")});
    if(nid){if(v("a_fav")==="1")await setFav(nid,true);S.open=nid;render();toast("Added to the board")}}
  if(f.id==="chatForm"){const i=$("#chatIn");const t=i.value.trim();if(t){i.value="";sendChat(t)}}
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&S.open&&!(S.open==="chat"&&S.chatBusy)){S.open=null;render()}
  if(e.target.id==="chatIn"&&e.key==="Enter"&&!e.shiftKey){e.preventDefault();$("#chatForm").requestSubmit()}});
function route(){const h=location.hash.replace("#","");S.tab=["feed","calendar","library","friends"].includes(h)?h:"feed";render();window.scrollTo(0,0)}
window.addEventListener("hashchange",route);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&S.key&&!S.locked&&!S.open)load()});
setInterval(()=>{if(document.visibilityState==="visible"&&S.key&&!S.locked&&!S.open)load()},45000);

/* ---------- Claude ---------- */
function chatHtml(){return `<div class="chat-h"><span class="ask" style="pointer-events:none"><span class="dot">C</span>Claude</span><div class="spacer"></div><button class="btn ghost" data-act="close" aria-label="Close">✕</button></div>
  <div class="msgs" id="msgs"></div>
  <div class="sugg" id="sugg">${["What comes out this week?","Add Frieren to the board","One Piece skips next Sunday","Which titles do we rate highest?","Change the accent color to matcha"].map(s=>`<button data-act="sugg">${esc(s)}</button>`).join("")}</div>
  <form class="composer" id="chatForm"><textarea id="chatIn" rows="1" placeholder="Ask Claude to add a title, fix a date, log progress…" aria-label="Message Claude"></textarea><button class="btn primary" type="submit" id="chatSend">Send</button></form>`}
function renderMsgs(){const m=$("#msgs");if(!m)return;
  m.innerHTML=S.chat.length?S.chat.map(x=>`<div class="msg ${x.role==="user"?"u":x.role==="tool"?"tool":"a"}">${x.html||esc(x.content)}</div>`).join(""):`<div class="msg a">Hi ${esc(nameOf(S.me))}! I can see the whole board and search AniList. Ask me to add titles, change release dates, log what you've watched, rate an episode or change the look.</div>`;
  m.scrollTop=m.scrollHeight;const s=$("#sugg");if(s)s.hidden=S.chat.length>0;
  const b=$("#chatSend");if(b){b.textContent=S.chatBusy?"Stop":"Send";b.type=S.chatBusy?"button":"submit";if(S.chatBusy)b.dataset.act="stop";else delete b.dataset.act}}
function boardSummary(){return list().map(t=>{const p=proj(t);return `${t.id} | ${t.name} | ${t.kind}${t.format==="MOVIE"?" movie":""} | ${t.status} | latest ${p.latest}${t.total?"/"+t.total:""} | next ${p.next?unit(t)+" "+p.next.n+" "+p.next.date+(p.next.est?" (est)":""):(t.window||"none")} | cadence ${t.cadence||"-"} | my progress ${myAt(t.id)}${isFav(t.id)?" | FAVORITE":""}`}).join("\n")}
const TOOLS=[
 {name:"search_anilist",description:"Search AniList for any anime, manga, manhwa, manhua or light novel, including ones not on the board. Returns ids to use with add_from_anilist.",input_schema:{type:"object",properties:{query:{type:"string"},type:{type:"string",enum:["ANIME","MANGA","BOTH"]}},required:["query"]},
  run:async i=>{const r=await aniSearch(String(i.query),i.type||"BOTH");S.ani.res=r;return r.slice(0,10).map(m=>({anilistId:m.id,title:aniName(m),type:m.type,format:aniFormat(m),status:m.status,year:(m.startDate&&m.startDate.year)||null,episodes:m.episodes,chapters:m.chapters,nextEpisode:m.nextAiringEpisode?{n:m.nextAiringEpisode.episode,date:cphDate(m.nextAiringEpisode.airingAt*1000)}:null,onBoard:!!onBoard(m.id)}))}},
 {name:"add_from_anilist",description:"Add a title found with search_anilist to the board, with its real cover, episodes and dates.",input_schema:{type:"object",properties:{anilistId:{type:"number"},favorite:{type:"boolean"},series:{type:"string",description:"Optional franchise name for grouping"}},required:["anilistId"]},
  run:async i=>{let m=S.ani.res.find(x=>x.id===i.anilistId);if(!m)m=(await aniByIds([i.anilistId]))[0];if(!m)return {ok:false,error:"not found"};const id=await addFromAni(m,i.favorite!==false);if(id&&i.series)await updateTitle(id,{series:i.series});return {ok:!!id,id}}},
 {name:"update_title",description:"Change release info or details for a title on the board. Only pass fields that change. Dates YYYY-MM-DD, Danish time. To clear the next release pass nextNum:null and nextDate:null.",input_schema:{type:"object",properties:{id:{type:"string"},name:{type:"string"},series:{type:"string"},status:{type:"string",enum:["airing","upcoming","hiatus","finished"]},latest:{type:"number"},total:{type:"number"},nextNum:{type:["number","null"]},nextDate:{type:["string","null"]},estimated:{type:"boolean"},cadence:{type:"string",enum:["","weekly","monthly"]},breaks:{type:"array",items:{type:"string"}},window:{type:"string"},note:{type:"string"}},required:["id"]},
  run:async i=>{const {id,...f}=i;return {ok:await updateTitle(id,f)}}},
 {name:"add_title_manually",description:"Add a title that AniList doesn't have.",input_schema:{type:"object",properties:{name:{type:"string"},kind:{type:"string",enum:["anime","manga","novel"]},series:{type:"string"},status:{type:"string",enum:["airing","upcoming","hiatus","finished"]},latest:{type:"number"},nextNum:{type:"number"},nextDate:{type:"string"},estimated:{type:"boolean"},cadence:{type:"string",enum:["","weekly","monthly"]},window:{type:"string"},note:{type:"string"}},required:["name","kind"]},
  run:async i=>{const id=await addTitle(i);return {ok:!!id,id}}},
 {name:"remove_title",description:"Remove a title for everyone. Only after the user clearly confirmed removing that title.",input_schema:{type:"object",properties:{id:{type:"string"}},required:["id"]},run:async i=>({ok:await removeTitle(i.id)})},
 {name:"set_progress",description:"Set the last episode/chapter the current user has seen.",input_schema:{type:"object",properties:{id:{type:"string"},number:{type:"number"}},required:["id","number"]},run:async i=>({ok:await setAt(i.id,i.number)})},
 {name:"set_favorite",description:"Pin or unpin a title as the current user's favorite.",input_schema:{type:"object",properties:{id:{type:"string"},on:{type:"boolean"}},required:["id","on"]},run:async i=>({ok:await setFav(i.id,i.on)})},
 {name:"rate",description:"Current user's score 1-10 for one episode/chapter; null removes it.",input_schema:{type:"object",properties:{id:{type:"string"},number:{type:"number"},score:{type:["number","null"]}},required:["id","number","score"]},
  run:async i=>{const cur=S.ratings[S.me+"__"+i.id+"__"+i.number];if(i.score!=null&&cur&&cur.score===i.score)return {ok:true};return {ok:await rate(i.id,i.number,i.score)}}},
 {name:"get_ratings",description:"All ratings on the board per person.",input_schema:{type:"object",properties:{}},run:async()=>people().map(u=>({person:nameOf(u),ratings:Object.values(S.ratings).filter(r=>r.person===u).map(r=>({title:(S.titles[r.tid]||{}).name,n:r.n,score:r.score}))}))},
 {name:"set_accent",description:"Change the app's accent color for everyone.",input_schema:{type:"object",properties:{accent:{type:"string",enum:Object.keys(ACCENTS)}},required:["accent"]},run:async i=>{S.settings.accent=i.accent;applyAccent();return {ok:await guard(()=>rpc("jk_put_setting",{sk:"accent",sv:i.accent}))}}},
 {name:"log_feature_request",description:"Record a request to change how the app itself works (new screens, layout, features) that these tools can't do.",input_schema:{type:"object",properties:{text:{type:"string"}},required:["text"]},run:async i=>({ok:await guard(()=>rpc("jk_add_request",{txt:String(i.text),pid:S.me}))})}
];
const LABEL={add_from_anilist:"Added",update_title:"Updated",add_title_manually:"Added",remove_title:"Removed",set_progress:"Progress set",set_favorite:"Favorite",rate:"Rated",set_accent:"Accent changed",log_feature_request:"Noted request",search_anilist:"Searched AniList"};
async function sendChat(text){
  if(S.chatBusy)return;
  S.chat.push({role:"user",content:text});S.chatBusy=true;const live={role:"assistant",content:"Thinking…"};S.chat.push(live);renderMsgs();
  const sys=`You are Claude, built into "Jikai", a shared anime and manga release tracker for a group of friends. You are talking to ${nameOf(S.me)}. Today is ${fmtLong(today())} (${today()}), Danish time. Reply in the language the user writes in, short and friendly, plain text without markdown.
Use tools to change the board. To add something, call search_anilist first, then add_from_anilist with the right id (use add_title_manually only if AniList doesn't have it). AniList has air dates for anime but not manga chapters: for manga set nextNum/nextDate/cadence with update_title if the user tells you, and mark guesses estimated:true. Weekly/monthly titles roll forward automatically. Never call remove_title without the user's clear confirmation of that specific title. For changes to how the app works beyond these tools, call log_feature_request and say it can be built later in the chat where the app was made.
BOARD (id | name | kind | status | latest | next | cadence | user's progress):
${boardSummary()}`;
  const convo=[];S.chat.filter(m=>(m.role==="user"||m.role==="assistant")&&m!==live&&m.content).slice(-10).forEach(m=>convo.push({role:m.role,content:m.content}));
  while(convo.length&&convo[0].role!=="user")convo.shift();
  S.abort=new AbortController();
  try{
    for(let round=0;round<8;round++){
      const r=await fetch(CLAUDE_FN,{method:"POST",signal:S.abort.signal,headers:{"Content-Type":"application/json"},body:JSON.stringify({k:S.key,system:sys,messages:convo,tools:TOOLS.map(({name,description,input_schema})=>({name,description,input_schema}))})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok){live.content=j.error==="no_api_key"?"":(j.error==="forbidden"?"This board's key isn't valid any more.":"Claude couldn't answer right now. Try again in a moment.");if(j.error==="no_api_key")live.html=setupHtml();break}
      const content=j.content||[];convo.push({role:"assistant",content});
      const txt=content.filter(c=>c.type==="text").map(c=>c.text).join("\n").trim();if(txt)live.content=txt;
      const uses=content.filter(c=>c.type==="tool_use");if(!uses.length||j.stop_reason!=="tool_use"){if(!txt)live.content="Done.";break}
      const results=[];
      for(const u of uses){const tool=TOOLS.find(t=>t.name===u.name);let out;try{out=tool?await tool.run(u.input||{}):{error:"unknown tool"}}catch(err){out={ok:false,error:String(err&&err.message||err)}}
        if(LABEL[u.name]&&u.name!=="search_anilist"&&u.name!=="get_ratings"){const nm=u.input.id&&S.titles[u.input.id]?S.titles[u.input.id].name:(out&&out.id&&S.titles[out.id]?S.titles[out.id].name:(u.input.name||u.input.accent||""));S.chat.splice(S.chat.indexOf(live),0,{role:"tool",content:"✓ "+LABEL[u.name]+(nm?" · "+nm:"")})}
        results.push({type:"tool_result",tool_use_id:u.id,content:JSON.stringify(out).slice(0,8000)})}
      convo.push({role:"user",content:results});live.content=txt||"Working on it…";renderMsgs();
    }
  }catch(e){live.content=e&&e.name==="AbortError"?"Stopped.":"Couldn't reach Claude. Check your connection and try again."}
  live.content=live.content||"";S.chatBusy=false;renderMsgs();render();
}
function setupHtml(){return `<div class="setup"><b>Claude needs a key before it can answer here.</b><ol><li>Get an API key at console.anthropic.com (pay as you go; a chat like this costs well under 1 kr.).</li><li>In Supabase, open the Jikai project → Edge Functions → Secrets.</li><li>Add a secret named <span class="mono">ANTHROPIC_API_KEY</span> with your key.</li></ol>Then ask again. Everything else in the app works without it.</div>`}

/* ---------- boot ---------- */
function boot(){
  const u=new URL(location.href);const k=u.searchParams.get("k");
  if(k){S.key=k;ls.set("jikai.key",k)}else{S.key=ls.get("jikai.key")}
  S.me=ls.get("jikai.me");
  route();
  if(S.key)load().then(()=>{if(!S.locked&&S.loaded)syncAniList()});
  if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
}
boot();
})();
