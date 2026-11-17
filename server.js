"use strict";
/** Conflict Economy Ventures 2040 — server-authoritative classroom simulation. */
const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const QRCode = require("qrcode");
const { Server } = require("socket.io");
const { STORY, FACTIONS, ROUND_DEFS, QUICK_INDICES, FULL_INDICES, factionScenario } = require("./game-data");
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "12kb" }));
app.use(express.static(path.join(__dirname,"public"),{etag:true}));
app.get("/",(_req,res)=>res.redirect("/host.html"));
app.get("/api/health",(_req,res)=>res.json({ok:true,version:"3.0.0",service:"CEV 2040 3D",at:Date.now()}));
const server=http.createServer(app);
const io=new Server(server,{maxHttpBufferSize:20_000,pingTimeout:25000,pingInterval:25000});
const rooms=new Map();
const LETTERS="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const COLORS=["#72c7ff","#5de2b6","#bc9bff","#ffbb6c","#ff839f","#72d7d6","#e7d37a","#c1d1e5"];
const AVATARS=["🧑‍💼","👩‍💻","🧑‍🚀","👩‍🔬","🕵️","🧑‍🎓","👨‍🚀","🦾","👩‍🚀","🧑‍🔧","👨‍🏭","👩‍⚖️"];
const SAVE_FILE=process.env.SAVE_FILE||""; // optional local disk; Render free filesystem is ephemeral
const TTL=12*60*60*1000;
const num=(n,def=0)=>Number.isFinite(Number(n))?Number(n):def;
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const round=(x,d=2)=>Math.round(x*10**d)/10**d;
const clean=v=>typeof v==="string"?v:"";
const text=(v,max=120)=>clean(v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);
const upper=v=>clean(v).toUpperCase().trim().replace(/[^A-Z0-9]/g,"");
const token=()=>crypto.randomBytes(24).toString("base64url");
const ack=(cb,ok,data={})=>typeof cb==="function"&&cb({ok,...data});
const fail=(cb,error)=>ack(cb,false,{error});
const cap=(n)=>round(clamp(num(n),0,99),2);
const metricNames=["capital","workforce","influence","stability","intel","morale"];
function mintCode(){for(let j=0;j<100;j++){let c="";for(let i=0;i<6;i++)c+=LETTERS[crypto.randomInt(LETTERS.length)];if(!rooms.has(c))return c;}throw new Error("No room codes available");}
function logNews(room,headline,type="info"){room.news.unshift({id:crypto.randomUUID(),headline:text(headline,210),type,at:Date.now()});room.news=room.news.slice(0,26);}
function save(){if(!SAVE_FILE)return;try{const fs=require("fs");const payload=[...rooms.values()].map(r=>({code:r.code,ownerKey:r.ownerKey,modKey:r.modKey,created:r.created,lastTouched:r.lastTouched,phase:r.phase,mode:r.mode,teamCount:r.teamCount,playerIds:[...r.players.values()].map(p=>({...p,online:false,socketId:null})),teams:r.teams,roundPos:r.roundPos,history:r.history,submissions:[...r.submissions],offers:r.offers,news:r.news,deadlineAt:r.deadlineAt,duration:r.duration}));fs.mkdirSync(path.dirname(SAVE_FILE),{recursive:true});fs.writeFileSync(SAVE_FILE+".tmp",JSON.stringify(payload));fs.renameSync(SAVE_FILE+".tmp",SAVE_FILE);}catch(e){console.warn("Save failed:",e.message);}}
function restore(){if(!SAVE_FILE)return;try{const fs=require("fs");if(!fs.existsSync(SAVE_FILE))return;const list=JSON.parse(fs.readFileSync(SAVE_FILE,"utf8"));for(const v of list){const r={...v,players:new Map(v.playerIds.map(p=>[p.id,p])),submissions:new Map(v.submissions),timer:null};r.currentIdx=(r.mode==="quick"?QUICK_INDICES:FULL_INDICES)[r.roundPos]??-1;if(r.phase==="active"){r.phase="revealed";r.deadlineAt=null; // never continue an expired or ambiguous round after process restart
  r.history[r.roundPos]={title:"Interrupted round",results:[],message:"Server restarted mid-round. Host may advance; no choices were charged."};}
rooms.set(r.code,r);}console.log(`Restored ${rooms.size} room(s) from local disk`);}catch(e){console.warn("Room restore skipped:",e.message);}}
restore();
function createRoom(){const c=mintCode();const r={code:c,ownerKey:token(),modKey:token(),created:Date.now(),lastTouched:Date.now(),phase:"lobby",mode:"full",teamCount:4,players:new Map(),teams:[],roundPos:-1,currentIdx:-1,history:[],submissions:new Map(),offers:[],news:[],deadlineAt:null,duration:0,timer:null};rooms.set(c,r);logNews(r,"Room established. The market awaits its entrepreneurs.");save();return r;}
app.post("/api/rooms",(req,res)=>{const room=createRoom();res.status(201).json({code:room.code,ownerKey:room.ownerKey,moderatorKey:room.modKey});});
app.get("/api/qr",async(req,res)=>{const raw=clean(req.query.url);let u;try{u=new URL(raw);}catch{return res.status(400).send("Invalid URL");}if(!["http:","https:"].includes(u.protocol)||raw.length>700)return res.status(400).send("Invalid URL");try{const svg=await QRCode.toString(raw,{type:"svg",margin:2,width:350,color:{dark:"#101f32",light:"#ffffff"}});res.type("svg").set("Cache-Control","no-store").send(svg);}catch{res.status(500).send("QR unavailable");}});
function getRoom(socket){return rooms.get(socket.data.roomCode)||null;}
function owner(socket,cb){const r=getRoom(socket);if(!r||socket.data.role!=="owner"){fail(cb,"Main host access required.");return null;}return r;}
function host(socket,cb){const r=getRoom(socket);if(!r||!["owner","moderator"].includes(socket.data.role)){fail(cb,"Host access required.");return null;}return r;}
function playerFor(socket){const r=getRoom(socket);if(!r||socket.data.role!=="player")return null;const p=r.players.get(socket.data.playerId);return p&&p.token===socket.data.playerToken?{r,p}:null;}
function teamFor(r,p){return r.teams.find(t=>t.index===p.teamIndex)||null;}
function faction(t){return FACTIONS[t.factionIndex];}
function scenarioForTeam(t,index){
 const sc=factionScenario(t.factionIndex,index);
 if(t.stats.intel>=6){
  sc.intelWarning=index===2?"INTEL LEAK: Protest networks are mobilizing; a one-off extraction windfall may erase long-term income.":index===4?"INTEL LEAK: Citizens will challenge any summit arrangement without verifiable oversight.":"INTEL LEAK: Trusted data predicts that stable labor relationships improve future revenue more than surprise extraction.";
  if(index>0)sc.options.push({title:"◈ UNLOCKED: Predictive social intelligence",detail:"Spend intelligence nodes on a verified early-warning and labor dialogue system.",tradeoff:"Requires 2 intel; improves influence, stability and morale",delta:{capital:-.13,workforce:2,influence:1,stability:2,intel:-2,morale:8},outcome:"Advance warning and negotiated adjustments protect operations from avoidable unrest."});
 }
 return sc;
}
function currentRound(r){return r.currentIdx>=0?ROUND_DEFS[r.currentIdx]:null;}
function totalRounds(r){return(r.mode==="quick"?QUICK_INDICES:FULL_INDICES).length;}
function teamScore(t){const mean={profit:0,survival:0,power:0};for(const field of Object.keys(mean)){const arr=Object.values(t.ratings).filter(x=>Number.isFinite(x[field]));mean[field]=arr.length?round(arr.reduce((a,b)=>a+b[field],0)/arr.length,1):0;}
const m=t.stats;const total=round(m.capital*5+m.workforce*.08+m.influence*3.5+m.stability*3.5+m.intel*2.8+m.morale*.12+Object.values(mean).reduce((a,b)=>a+b*2,0),1);return{total,vc:mean};}
function moraleStatus(n){return n<35?"CRISIS":n<50?"Tense":n<70?"Stable":"Strong";}
function archetype(t){const m=t.stats;if(m.morale<35)return"The Sweatshop Warlord";if(m.stability>=9&&m.morale>=75)return"The People's Champion";if(m.intel>=8)return"The Algorithmic Oligarch";if(m.influence>=9)return"The Shadow Diplomat";if(m.capital>=4&&m.morale<55)return"The Shadow Oligarch";return"The Reluctant Tycoon";}
function publicTeam(r,t,asHost){const s=t.stats;const pts=teamScore(t);const members=t.memberIds.map(id=>r.players.get(id)).filter(Boolean);const obj={index:t.index,id:t.id,name:t.name,color:t.color,icon:faction(t).icon,short:faction(t).short,factionId:faction(t).id,members:members.map(p=>({name:p.name,avatar:p.avatar,online:p.online,ready:p.ready})),ready:members.filter(p=>p.ready).length,memberCount:members.length,submitted:r.submissions.has(t.index),strike:t.strike,crisis:!!t.crisis,resources:{capital:s.capital,workforce:s.workforce,influence:s.influence,stability:s.stability,intel:s.intel},morale:asHost?s.morale:null,moraleStatus:moraleStatus(s.morale),income:t.lastIncome,score:pts.total,vc:pts.vc,archetype:archetype(t)};return obj;}
function resolvedResults(r){if(r.phase==="revealed"||r.phase==="finished")return r.history[r.roundPos]||null;return null;}
function audienceState(r,socket){const asHost=["owner","moderator"].includes(socket.data.role);
const p=asHost?null:r.players.get(socket.data.playerId);const t=p&&p.teamIndex!==null?teamFor(r,p):null;
const base={code:r.code,role:socket.data.role,canControl:socket.data.role==="owner",canScore:asHost,phase:r.phase,mode:r.mode,teamCount:r.teamCount,roundPos:r.roundPos,totalRounds:totalRounds(r),round:currentRound(r),deadlineAt:r.deadlineAt,serverNow:Date.now(),news:r.news.slice(0,15),story:STORY,playerCount:r.players.size,connectedCount:[...r.players.values()].filter(x=>x.online).length,teams:r.teams.map(x=>publicTeam(r,x,asHost)),result:resolvedResults(r),standings:[...r.teams].map(x=>({index:x.index,name:x.name,color:x.color,icon:faction(x).icon,score:teamScore(x).total,archetype:archetype(x)})).sort((a,b)=>b.score-a.score||a.index-b.index)};
if(asHost){return{...base,players:[...r.players.values()].map(p=>({id:p.id,name:p.name,avatar:p.avatar,online:p.online,ready:p.ready,teamIndex:p.teamIndex})),myRatings:Object.fromEntries(r.teams.map(t=>[t.index,t.ratings[socket.data.raterId]||{}])),connectedHosts:[...io.sockets.sockets.values()].filter(s=>s.connected&&s.data.roomCode===r.code&&["owner","moderator"].includes(s.data.role)).length,submittedCount:r.submissions.size,pendingOffers:r.offers.filter(o=>o.status==="pending").length,allReady:r.players.size>0&&[...r.players.values()].every(p=>p.ready),summaries:r.teams.map(t=>({index:t.index,brief:faction(t).rules,question:r.currentIdx>=0?factionScenario(t.factionIndex,r.currentIdx).prompt:null}))};}
const myOffer=r.offers.filter(o=>t&&(o.from===t.index||(o.to===t.index&&o.kind!=="poach"))).map(o=>({...o}));
const sub=t?r.submissions.get(t.index):null;
return{...base,myId:p?.id||null,myName:p?.name||"",myAvatar:p?.avatar||"",myReady:!!p?.ready,myTeamIndex:t?.index??null,myTeam:t?publicTeam(r,t,true):null,myBrief:t?{...faction(t),prompts:undefined,secret:faction(t).secret}:null,myScenario:t&&r.currentIdx>=0?scenarioForTeam(t,r.currentIdx):null,mySubmitted:!!sub,myChoice:sub?{optionIndex:sub.optionIndex,note:sub.note}:null,myOffers:myOffer};}
function broadcast(r){r.lastTouched=Date.now();for(const s of io.sockets.sockets.values())if(s.connected&&s.data.roomCode===r.code)s.emit("room:state",audienceState(r,s));save();}
function unbind(s){const r=getRoom(s);if(r&&s.data.role==="player"){const p=r.players.get(s.data.playerId);if(p&&p.socketId===s.id){p.online=false;p.socketId=null;broadcast(r);}}if(s.data.roomCode)s.leave(`game:${s.data.roomCode}`);s.data.roomCode=null;s.data.role=null;s.data.playerId=null;s.data.playerToken=null;}
function bind(s,r,role,p=null){unbind(s);s.data.roomCode=r.code;s.data.role=role;if(p){s.data.playerId=p.id;s.data.playerToken=p.token;p.online=true;p.socketId=s.id;}s.join(`game:${r.code}`);}
function randomize(players){const a=players.slice();for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function roundDuration(r){const d=currentRound(r)?.duration||180;const test=Number(process.env.ROUND_SECONDS);return Number.isFinite(test)&&test>=1&&test<=3600?test:d;}
function schedule(r){if(r.timer)clearTimeout(r.timer);if(r.phase!=="active")return;const pos=r.roundPos;r.timer=setTimeout(()=>{if(r.phase==="active"&&r.roundPos===pos){if(Date.now()>=r.deadlineAt)reveal(r);else schedule(r);}},Math.max(20,r.deadlineAt-Date.now()+20));r.timer.unref?.();}
function applyDelta(s,d){for(const key of metricNames){const value=num(d[key]);if(key==="capital")s[key]=cap(s[key]+value);else if(key==="workforce")s[key]=Math.round(clamp(s[key]+value,0,500));else if(key==="morale")s[key]=Math.round(clamp(s[key]+value,0,100));else s[key]=Math.round(clamp(s[key]+value,0,10));}}
function chooseRival(r,t){return r.teams.filter(x=>x!==t).sort((a,b)=>b.stats.morale-a.stats.morale||a.index-b.index)[0]||null;}
function resolveDeals(r){const results=[];for(const o of r.offers){if(o.status==="resolved")continue;const from=r.teams[o.from],to=r.teams[o.to];if(!from||!to)continue;let desc="No agreement reached.";
 if(o.kind==="poach"){
  if(from.stats.capital>=0.30){applyDelta(from.stats,{capital:-0.30});if(from.stats.morale>=to.stats.morale+10&&to.stats.workforce>=15){const count=Math.min(9,Math.floor(to.stats.workforce*.12));applyDelta(to.stats,{workforce:-count,morale:-4});applyDelta(from.stats,{workforce:count});desc=`${from.name} recruited ${count} specialists from ${to.name}.`;logNews(r,`TALENT MARKET: ${count} specialists move from ${to.name} to ${from.name}.`,"alert");}else{desc=`${from.name} paid a headhunting firm, but rival workers refused to defect.`;}}
  else desc=`${from.name} lacked the capital to finance its recruitment bid.`;
 }else if(o.status==="accepted"){
  if(o.kind==="trade"&&from.stats.capital>=0.40){applyDelta(from.stats,{capital:-.40,influence:1,stability:1});applyDelta(to.stats,{capital:.28,stability:1});desc=`${from.name} funded a shared commercial corridor with ${to.name}.`;}
  else if(o.kind==="alliance"&&from.stats.capital>=.18&&to.stats.capital>=.18){applyDelta(from.stats,{capital:-.18,stability:2,influence:1,morale:4});applyDelta(to.stats,{capital:-.18,stability:2,influence:1,morale:4});desc=`${from.name} and ${to.name} signed a monitored cooperation arrangement.`;}
  else desc="The parties reached an agreement but could not finance it.";
  logNews(r,`BACKCHANNEL: ${desc}`,"deal");
 }else{desc=`${to.name} declined (or did not accept) ${from.name}'s ${o.kind} offer.`;}
 o.status="resolved";results.push({from:o.from,to:o.to,kind:o.kind,description:desc});}
 return results;
}
function applyUnrest(r,t){const s=t.stats;let defections=0,recipient=null;
 if(s.stability<=2){if(!t.crisis)logNews(r,`REGIONAL CRISIS: Public confidence collapses around ${t.name}; contracts and commerce face disruption.`,"danger");t.crisis=true;applyDelta(s,{capital:-.16,morale:-6,influence:-1});}
 else if(s.stability>=4){if(t.crisis)logNews(r,`STABILITY RECOVERY: Civic agreements restore operations around ${t.name}.`,"good");t.crisis=false;}
 if(s.morale<25){defections=Math.max(2,Math.floor(s.workforce*.13));const rival=chooseRival(r,t);applyDelta(s,{workforce:-defections});if(rival&&rival.stats.morale>s.morale+14){applyDelta(rival.stats,{workforce:defections,morale:-1});recipient=rival.index;logNews(r,`DEFECTIONS: ${defections} staff abandon ${t.name} for ${rival.name}.`,"alert");}else{logNews(r,`DEFECTIONS: ${defections} workers resign from ${t.name} after prolonged grievances.`,"alert");}}
 if(s.morale<35){if(!t.strike)logNews(r,`GENERAL STRIKE: Workers at ${t.name} halt production and demand concessions.`,"danger");t.strike=true;}
 else if(s.morale>=48){if(t.strike)logNews(r,`STRIKE ENDS: ${t.name} resumes operations following worker concessions.`,"good");t.strike=false;}
 return {defections,recipient};}
function income(r,t){const s=t.stats;if(t.strike){t.lastIncome=0;return 0;}const base=faction(t).baseYield+s.workforce*.0017+s.intel*.028+s.influence*.011;
 const modifier=clamp((.57+s.stability*.055)*(s.morale<50?.75:1)*(t.crisis?.65:1),.18,1.25);const amount=round(base*modifier,2);applyDelta(s,{capital:amount});t.lastIncome=amount;return amount;}
function reveal(r){if(r.phase!=="active")return;clearTimeout(r.timer);r.timer=null;const results=[];
 for(const t of r.teams){const sub=r.submissions.get(t.index);const sc=scenarioForTeam(t,r.currentIdx);const opt=sub?sc.options[sub.optionIndex]:null;
  const delta=opt?opt.delta:{capital:-.12,workforce:0,influence:-1,stability:-1,intel:0,morale:-7};
  applyDelta(t.stats,delta);
  let sanction="";
  if(sub?.optionIndex===0&&(r.currentIdx===2||r.currentIdx===4)){
    applyDelta(t.stats,{capital:-.22,influence:-1,stability:-1});
    sanction="Civil society coalitions secure targeted investor sanctions: −$0.22B, −1 influence, −1 stability.";
    logNews(r,`SANCTIONS: Citizen coalitions challenge opaque extraction by ${t.name}.`,"alert");
  }
  results.push({teamIndex:t.index,teamName:t.name,choice:opt?.title||"No decision submitted",outcome:(opt?.outcome||"Uncertainty damages confidence and morale.")+(sanction?" "+sanction:""),delta,sanction,submitted:!!sub,note:sub?.note||"",strike:false,income:0,defections:0,offerResult:null});
 }
 const deals=r.currentIdx===3?resolveDeals(r):[];
 for(const t of r.teams){const unrest=applyUnrest(r,t);const amount=income(r,t);const entry=results.find(x=>x.teamIndex===t.index);entry.strike=t.strike;entry.income=amount;entry.defections=unrest.defections;entry.defectionTo=unrest.recipient;}
 if(r.currentIdx===2)logNews(r,"CIVIL SOCIETY WILDCARD: Citizen coalitions demand representation at the 2040 summit.","alert");
 r.history[r.roundPos]={round:r.currentIdx,title:currentRound(r).title,results,deals};r.phase="revealed";r.deadlineAt=null;
 logNews(r,`${currentRound(r).title}: results released. The venture market reacts.`,"info");
 broadcast(r);
}
function nextRound(r){if(r.timer)clearTimeout(r.timer);r.roundPos++;const idxs=r.mode==="quick"?QUICK_INDICES:FULL_INDICES;if(r.roundPos>=idxs.length){r.phase="finished";r.currentIdx=-1;r.deadlineAt=null;logNews(r,"THE INVESTMENT SUMMIT CLOSES. Final standings have been announced.","good");broadcast(r);return;}
 r.currentIdx=idxs[r.roundPos];r.phase="active";r.submissions=new Map();r.offers=[];r.duration=roundDuration(r);r.deadlineAt=Date.now()+r.duration*1000;logNews(r,`NEW ROUND: ${currentRound(r).title} is now live on every phone.`,"info");schedule(r);broadcast(r);}
function reset(r){clearTimeout(r.timer);r.timer=null;r.phase="lobby";r.roundPos=-1;r.currentIdx=-1;r.teams=[];r.submissions=new Map();r.offers=[];r.history=[];r.news=[];r.deadlineAt=null;for(const p of r.players.values()){p.teamIndex=null;p.ready=false;}logNews(r,"Room reset. New ventures may join the lobby.");broadcast(r);}
io.on("connection",s=>{
 s.on("host:join",(v,cb)=>{const r=rooms.get(upper(v?.code));if(!r)return fail(cb,"Room not found. Recreate the room if Render restarted.");const role=v?.key===r.ownerKey?"owner":v?.key===r.modKey?"moderator":null;if(!role)return fail(cb,"Invalid host credentials. Use the browser that created the room or a moderator invite.");bind(s,r,role);const id=text(v?.clientId,80);s.data.raterId=role==="owner"?"owner":/^[-\w]{8,80}$/.test(id)?`mod-${id}`:`mod-${s.id}`;ack(cb,true,{code:r.code,role});broadcast(r);});
 s.on("player:join",(v,cb)=>{const r=rooms.get(upper(v?.code));if(!r)return fail(cb,"Room not found. Ask the host for a fresh code.");let p=clean(v?.token)?[...r.players.values()].find(x=>x.token===v.token):null;if(!p){if(r.phase!=="lobby")return fail(cb,"Game is already in progress; rejoin with your saved player session.");if(r.players.size>=300)return fail(cb,"This room has reached its 300 player limit.");const name=text(v?.name,32);if(!name)return fail(cb,"Enter your name.");if([...r.players.values()].some(x=>x.name.toLowerCase()===name.toLowerCase()))return fail(cb,"This name is already in the lobby. Add an initial.");p={id:crypto.randomUUID(),token:token(),name,avatar:AVATARS.includes(v?.avatar)?v.avatar:AVATARS[0],online:false,socketId:null,teamIndex:null,ready:false};r.players.set(p.id,p);logNews(r,`${p.avatar} ${p.name} has joined the investor lobby.`);}
 if(p.socketId&&p.socketId!==s.id){const prev=io.sockets.sockets.get(p.socketId);if(prev)prev.disconnect(true);}bind(s,r,"player",p);ack(cb,true,{code:r.code,token:p.token,name:p.name});broadcast(r);});
 s.on("host:configure",(v,cb)=>{const r=owner(s,cb);if(!r)return;if(r.phase!=="lobby")return fail(cb,"Configure the room before starting.");const count=num(v?.teamCount,NaN);const mode=v?.mode;if(!Number.isInteger(count)||count<1||count>32||!["quick","full"].includes(mode))return fail(cb,"Choose 1–32 teams and quick/full mode.");r.teamCount=count;r.mode=mode;ack(cb,true);broadcast(r);});
 s.on("host:removePlayer",(v,cb)=>{const r=owner(s,cb);if(!r)return;if(r.phase!=="lobby")return fail(cb,"Remove players only before assignment.");const p=r.players.get(clean(v?.id));if(!p)return fail(cb,"Player unavailable.");r.players.delete(p.id);if(p.socketId){const old=io.sockets.sockets.get(p.socketId);old?.disconnect(true);}ack(cb,true);broadcast(r);});
 s.on("host:assign",(_v,cb)=>{const r=owner(s,cb);if(!r)return;if(r.phase!=="lobby")return fail(cb,"Teams are already assigned.");if(r.players.size<r.teamCount)return fail(cb,`At least ${r.teamCount} players are required.`);if([...r.players.values()].some(x=>!x.online))return fail(cb,"Some players are offline. Reconnect them or remove them from the lobby.");const shuffled=randomize([...r.players.values()]);r.teams=Array.from({length:r.teamCount},(_,i)=>{const f=FACTIONS[i%4];return{index:i,id:`team-${i}`,name:`Team ${String.fromCharCode(65+(i%26))} · ${f.short}`,color:COLORS[i%COLORS.length],factionIndex:i%4,memberIds:[],stats:{capital:f.capital,workforce:f.workforce,influence:f.influence,stability:f.stability,intel:f.intel,morale:f.morale},strike:false,crisis:false,lastIncome:0,ratings:{}};});
 shuffled.forEach((p,i)=>{p.teamIndex=i%r.teams.length;p.ready=false;r.teams[p.teamIndex].memberIds.push(p.id);});r.phase="briefing";r.currentIdx=-1;r.roundPos=-1;r.deadlineAt=null;logNews(r,"FACTIONS ASSIGNED: Secret mandates delivered to every player's phone.","good");ack(cb,true);broadcast(r);});
 s.on("player:ready",(_v,cb)=>{const a=playerFor(s);if(!a)return fail(cb,"Join the room first.");if(a.r.phase!=="briefing")return fail(cb,"Briefing is no longer active.");a.p.ready=true;ack(cb,true);broadcast(a.r);});
 s.on("host:next",(_v,cb)=>{const r=owner(s,cb);if(!r)return;if(!["briefing","revealed"].includes(r.phase))return fail(cb,"Finish the briefing or current round before advancing.");nextRound(r);ack(cb,true);});
 s.on("host:reveal",(_v,cb)=>{const r=owner(s,cb);if(!r)return;if(r.phase!=="active")return fail(cb,"No active round to reveal.");reveal(r);ack(cb,true);});
 s.on("host:extend",(_v,cb)=>{const r=owner(s,cb);if(!r)return;if(r.phase!=="active")return fail(cb,"Only active rounds may be extended.");r.deadlineAt+=60_000;schedule(r);ack(cb,true);broadcast(r);});
 s.on("host:rate",(v,cb)=>{const r=host(s,cb);if(!r)return;if(r.phase==="lobby"||r.phase==="briefing")return fail(cb,"Rate teams after gameplay begins.");const index=Number(v?.teamIndex),metric=clean(v?.metric),rating=Number(v?.rating);if(!r.teams[index]||!["profit","survival","power"].includes(metric)||!Number.isInteger(rating)||rating<0||rating>5)return fail(cb,"Score must be 0–5.");const t=r.teams[index];if(!t.ratings[s.data.raterId])t.ratings[s.data.raterId]={};t.ratings[s.data.raterId][metric]=rating;ack(cb,true);broadcast(r);});
 s.on("host:reset",(_v,cb)=>{const r=owner(s,cb);if(!r)return;reset(r);ack(cb,true);});
 s.on("player:submit",(v,cb)=>{const a=playerFor(s);if(!a)return fail(cb,"Join as a player first.");const {r,p}=a;if(r.phase!=="active")return fail(cb,"No active round.");if(Date.now()>=r.deadlineAt){reveal(r);return fail(cb,"Time is up.");}const t=teamFor(r,p);if(!t)return fail(cb,"Team not found.");if(r.submissions.has(t.index))return fail(cb,"Your team already locked its decision.");const idx=Number(v?.optionIndex);const sc=scenarioForTeam(t,r.currentIdx);if(!Number.isInteger(idx)||idx<0||idx>=sc.options.length)return fail(cb,"Select an option.");const cost=sc.options[idx].delta;
 for(const k of ["capital","influence","intel"]){if(cost[k]<0&&t.stats[k]+.0001<Math.abs(cost[k]))return fail(cb,`Insufficient ${k} for this decision.`);}
 r.submissions.set(t.index,{optionIndex:idx,note:text(v?.note,220),by:p.id,at:Date.now()});ack(cb,true,{locked:true});if(r.submissions.size===r.teams.length)reveal(r);else broadcast(r);});
 s.on("player:resolveStrike",(v,cb)=>{const a=playerFor(s);if(!a)return fail(cb,"Join as player.");const {r,p}=a;if(r.phase!=="active")return fail(cb,"Resolve strikes during a live round.");const t=teamFor(r,p);if(!t||!t.strike)return fail(cb,"Your team has no active strike.");if(r.submissions.has(t.index))return fail(cb,"The team has already submitted; negotiate next round.");const kind=clean(v?.method);if(kind==="wages"){
 if(t.stats.capital<.35)return fail(cb,"Insufficient capital for the wage settlement.");applyDelta(t.stats,{capital:-.35,morale:28,stability:1});
 }else if(kind==="mediation"){
 if(t.stats.influence<2)return fail(cb,"You need at least two influence stars.");applyDelta(t.stats,{influence:-2,morale:20,stability:2});
 }else return fail(cb,"Choose wages or mediation.");if(t.stats.morale>=45){t.strike=false;logNews(r,`WORKER ACCORD: ${t.name} resolves its strike through ${kind==="wages"?"wage concessions":"mediation"}.`,"good");}
 else{logNews(r,`NEGOTIATIONS: ${t.name} makes partial concessions, but workers remain unconvinced.`,"alert");}
 ack(cb,true);broadcast(r);});
 s.on("player:offer",(v,cb)=>{const a=playerFor(s);if(!a)return fail(cb,"Join as a player.");const {r,p}=a;if(r.phase!=="active"||r.currentIdx!==3)return fail(cb,"Deals are possible only in Round 4.");const t=teamFor(r,p);if(!t)return fail(cb,"Team missing.");if(r.submissions.has(t.index))return fail(cb,"Your team has already locked its round decision.");if(r.offers.some(x=>x.from===t.index))return fail(cb,"Your team already made its one offer.");const to=Number(v?.target),kind=clean(v?.kind);if(!r.teams[to]||to===t.index||!["trade","alliance","poach"].includes(kind))return fail(cb,"Choose another team and a valid offer.");const o={id:crypto.randomUUID(),from:t.index,to,kind,status:kind==="poach"?"pending-poach":"pending",created:Date.now()};r.offers.push(o);ack(cb,true,{offerId:o.id});broadcast(r);});
 s.on("player:respondOffer",(v,cb)=>{const a=playerFor(s);if(!a)return fail(cb,"Join as a player.");const {r,p}=a;if(r.phase!=="active"||r.currentIdx!==3)return fail(cb,"No diplomacy phase is active.");const t=teamFor(r,p);const o=r.offers.find(x=>x.id===clean(v?.offerId));if(!o||o.to!==t?.index||o.status!=="pending")return fail(cb,"Offer not available for your team.");o.status=v?.accept===true?"accepted":"declined";ack(cb,true);broadcast(r);});
 s.on("disconnect",()=>{const r=getRoom(s);if(r&&s.data.role==="player"){const p=r.players.get(s.data.playerId);if(p&&p.socketId===s.id){p.online=false;p.socketId=null;}}if(r)broadcast(r);});
});
const cleanup=setInterval(()=>{for(const[c,r]of rooms)if(Date.now()-r.lastTouched>TTL){clearTimeout(r.timer);rooms.delete(c);}if(SAVE_FILE)save();},60*60*1000);cleanup.unref?.();
if(require.main===module){const port=Number(process.env.PORT)||3000;server.listen(port,"0.0.0.0",()=>console.log(`CEV 3D running on 0.0.0.0:${port}`));}
module.exports={app,server,io,rooms,createRoom,applyDelta,factionScenario,reveal,nextRound,teamScore};
