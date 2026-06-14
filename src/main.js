import './styles.css';

// Phase 1: the v3 mockup logic, ported as-is with in-memory state.
// Phases 2+ extract pure scoring/rules modules, fix the make-up counter, and add Dexie persistence.

const FACES={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function dieHTML(face){let s="";for(let i=0;i<9;i++){s+=FACES[face].includes(i)?"<b></b>":"<span></span>";}return `<span class="die">${s}</span>`;}

const UPPER=[
  {key:"aces",name:"Aces",face:1,hint:"Add up your 1s",type:"count"},
  {key:"twos",name:"Twos",face:2,hint:"Add up your 2s",type:"count"},
  {key:"threes",name:"Threes",face:3,hint:"Add up your 3s",type:"count"},
  {key:"fours",name:"Fours",face:4,hint:"Add up your 4s",type:"count"},
  {key:"fives",name:"Fives",face:5,hint:"Add up your 5s",type:"count"},
  {key:"sixes",name:"Sixes",face:6,hint:"Add up your 6s",type:"count"},
];
const LOWER=[
  {key:"threeKind",name:"Three of a Kind",hint:"Sum all 5 · ~21% a roll",type:"sum",max:30},
  {key:"fourKind",name:"Four of a Kind",hint:"Sum all 5 · ~2% a roll",type:"sum",max:30},
  {key:"fullHouse",name:"Full House",hint:"25 pts · ~4% a roll",type:"fixed",value:25},
  {key:"smallStraight",name:"Small Straight",hint:"30 pts · ~15% a roll",type:"fixed",value:30},
  {key:"largeStraight",name:"Large Straight",hint:"40 pts · ~3% a roll",type:"fixed",value:40},
  {key:"yahtzee",name:"Yahtzee",hint:"50 pts · ~0.08% a roll 🤯",type:"fixed",value:50},
  {key:"chance",name:"Chance",hint:"Sum all 5 · freebie",type:"sum",max:30},
  {key:"yahtzeeBonus",name:"Yahtzee Bonus",hint:"+100 · then take a whole extra turn",type:"bonus"},
];
const ALL=[...UPPER,...LOWER];
const META=Object.fromEntries(ALL.map(c=>[c.key,c]));
const BASE_KEYS=[...UPPER.map(c=>c.key),"threeKind","fourKind","fullHouse","smallStraight","largeStraight","yahtzee","chance"];

let state,orderCounter,activePlayer,soundOn,makeupPending;
function fresh(){
  state=[{},{}];orderCounter=0;activePlayer=0;makeupPending=[false,false];
  document.querySelectorAll(".pname").forEach((el,i)=>{if(!el.value.trim())el.value="Player "+(i+1);});
}
soundOn=true;fresh();

function catCell(c){const die=c.face?dieHTML(c.face):"";
  return `<div class="cat">${die}<div><div class="catname">${c.name}</div><div class="cathint">${c.hint}</div></div></div>`;}
function buildGrid(list,el){
  el.innerHTML=list.map(c=>`<div class="row" data-key="${c.key}">${catCell(c)}
    <div class="cell empty p0" data-key="${c.key}" data-p="0"></div>
    <div class="cell empty p1" data-key="${c.key}" data-p="1"></div></div>`).join("");}
buildGrid(UPPER,document.getElementById("upperGrid"));
buildGrid(LOWER,document.getElementById("lowerGrid"));
function calcRow(name,hint,id0,id1,cls){
  return `<div class="row calc ${cls||''}"><div class="cat"><div><div class="catname">${name}</div>${hint?`<div class="cathint">${hint}</div>`:''}</div></div>
    <div class="cell" id="${id0}">0</div><div class="cell" id="${id1}">0</div></div>`;}
document.getElementById("upperCalc").innerHTML=
  calcRow("Subtotal","","sub0","sub1","sub")+
  calcRow("Bonus","+35 if subtotal ≥ 63","bon0","bon1","bonus")+
  calcRow("Upper total","","up0","up1","uptot");
document.getElementById("lowerCalc").innerHTML=
  calcRow("Lower total","","low0","low1","lowtot")+
  calcRow("GRAND TOTAL","","grand0","grand1","grand");

function val(p,k){const s=state[p][k];return s?s.value:null;}
function upperRaw(p){let u=0;UPPER.forEach(c=>{if(state[p][c.key])u+=state[p][c.key].value;});return u;}
function compute(p){
  const u=upperRaw(p),bonus=u>=63?35:0,ut=u+bonus;
  let low=0;LOWER.forEach(c=>{if(state[p][c.key])low+=state[p][c.key].value;});
  return {upper:u,bonus,upperTotal:ut,lower:low,grand:ut+low};}
function filledCount(p){return BASE_KEYS.filter(k=>state[p][k]).length;}
function nameOf(p){return document.querySelector(`.pname[data-p="${p}"]`).value||("Player "+(p+1));}

function refresh(){
  document.querySelectorAll(".cell[data-key]").forEach(cell=>{
    const p=+cell.dataset.p,k=cell.dataset.key,s=state[p][k];
    cell.classList.remove("empty","zero","filled","lastbox");
    if(s){cell.innerHTML=s.value+`<span class="ord">${s.order}</span>`;cell.classList.add("filled");if(s.value===0)cell.classList.add("zero");}
    else{cell.innerHTML="";cell.classList.add("empty");}
  });
  [0,1].forEach(p=>{
    if(filledCount(p)===12){
      const k=BASE_KEYS.find(k=>!state[p][k]);
      const cell=document.querySelector(`.cell[data-key="${k}"][data-p="${p}"]`);
      if(cell){cell.classList.add("lastbox");cell.classList.remove("empty");cell.innerHTML="";}
    }
  });
  [0,1].forEach(p=>{
    const t=compute(p);
    document.getElementById("sub"+p).textContent=t.upper;
    document.getElementById("bon"+p).textContent=t.bonus;
    document.getElementById("up"+p).textContent=t.upperTotal;
    document.getElementById("low"+p).textContent=t.lower;
    document.getElementById("grand"+p).textContent=t.grand;
    document.getElementById("tot"+p).textContent=t.grand;
    document.getElementById("meta"+p).textContent=filledCount(p)+" / 13 boxes";
  });
  document.querySelectorAll(".row.bonus").forEach((r,i)=>r.classList.toggle("hit",compute(i).bonus>0));
  updateStatus();
}

function updateStatus(){
  const sl=document.getElementById("statusLine"),p=activePlayer,nm=nameOf(p);
  if(makeupPending[p]){
    sl.className="statusline makeup";
    sl.innerHTML=`💎 <b>Bonus Yahtzee!</b> ${nm} takes a whole extra turn — fill any open box to even up the turns.`;
  }else{
    sl.className="statusline turn p"+p;
    sl.innerHTML=`🎲 <b>${nm}</b>'s turn — roll, then tap a box to score.`;
  }
}

function record(p,k,value){
  const before=compute(p);
  const existing=state[p][k];
  const wasNew=!existing;
  state[p][k]={value,order:existing?existing.order:(++orderCounter),ts:new Date().toISOString()};
  const after=compute(p);
  refresh();
  const cell=document.querySelector(`.cell[data-key="${k}"][data-p="${p}"]`);
  const crossedBonus=before.bonus===0&&after.bonus===35;
  let bonusDelta=0;
  if(k==="yahtzeeBonus"){const prev=existing?existing.value:0;bonusDelta=value-prev;}
  celebrate(p,k,value,cell,crossedBonus,bonusDelta);
  // ---- turn logic ----
  const isBonusTick=(k==="yahtzeeBonus"&&bonusDelta>0);
  if(isBonusTick){
    activePlayer=p;                 // their bonus — they keep control
    makeupPending[p]=true;          // owe a full make-up turn (fill an open box)
  }else if(wasNew&&BASE_KEYS.includes(k)){
    makeupPending[p]=false;         // this box-fill satisfies the make-up / normal turn
    activePlayer=p===0?1:0;         // pass control
  }
  syncActive();refresh();
}
function clearScore(p,k){delete state[p][k];refresh();}

function tierFor(k,value,crossedBonus,bonusDelta){
  const c=META[k];
  if(k==="yahtzeeBonus"&&bonusDelta>0)return "mega";
  if(value===0)return "bust";
  if(k==="yahtzee")return "legendary";
  if(k==="largeStraight"||k==="fourKind")return "epic";
  if(k==="smallStraight"||k==="fullHouse")return "great";
  if(c.type==="count"&&value===c.face*5)return "great";
  if(crossedBonus)return "great";
  if(c.type==="count"&&value===c.face*4)return "nice";
  if(k==="chance"&&value>=24)return "nice";
  return "normal";
}
const TOAST={
  mega:{emo:"💎",label:"BONUS YAHTZEE!!",extra:" · extra turn!"},
  legendary:{emo:"🎲✨",label:"YAHTZEE!"},
  epic:{emo:"🔥",label:"BIG ROLL!"},
  great:{emo:"🙌",label:"NICE ONE!"},
  nice:{emo:"👍",label:"Solid"},
  bust:{emo:"😬",label:"Scratched"},
};
function celebrate(p,k,value,cell,crossedBonus,bonusDelta){
  const tier=tierFor(k,value,crossedBonus,bonusDelta);
  cell.classList.remove("pop","bust");void cell.offsetWidth;
  cell.classList.add(tier==="bust"?"bust":"pop");
  if(tier==="mega")S.bonus();else if(tier==="legendary")S.yahtzee();else if(tier==="epic")S.epic();
  else if(tier==="great")S.great();else if(tier==="nice")S.chime();else if(tier==="bust")S.sad();else S.tick();
  const cfg=TOAST[tier];
  if(cfg&&tier!=="normal"){
    const ptsTxt=k==="yahtzeeBonus"?"+"+bonusDelta:(value===0?"+0":"+"+value);
    const label=(crossedBonus&&tier==="great")?"UPPER BONUS! +35":cfg.label;
    showToast(cfg.emo,label,ptsTxt+(cfg.extra||""));
  }
  if(tier==="mega"){confettiBurst(180);shake();}
  else if(tier==="legendary"){confettiBurst(140);shake();}
  else if(tier==="epic"){confettiBurst(70);}
  else if(tier==="great"){confettiBurst(38);}
  else if(crossedBonus){confettiBurst(50);}
}
function shake(){const d=document.getElementById("device");d.classList.remove("shake");void d.offsetWidth;d.classList.add("shake");}

const toastEl=document.getElementById("toast");let toastT;
function showToast(emo,label,pts){
  toastEl.innerHTML=`<div class="emo">${emo}</div><div class="big">${label}</div><div class="pts">${pts}</div>`;
  toastEl.classList.remove("show");void toastEl.offsetWidth;toastEl.classList.add("show");
  clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove("show"),1500);
}

const cv=document.getElementById("confetti"),cx=cv.getContext("2d");
let parts=[],raf=null;
function sizeCanvas(){cv.width=innerWidth;cv.height=innerHeight;}
sizeCanvas();addEventListener("resize",sizeCanvas);
const COLORS=["#2E7CF6","#FF5A47","#FFC83D","#22C9A0","#7C5CFC","#FF7FB0"];
function confettiBurst(n){
  if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;
  const cxp=innerWidth/2,cyp=innerHeight*0.34;
  for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,sp=4+Math.random()*9;
    parts.push({x:cxp,y:cyp,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-4,g:0.18+Math.random()*0.12,
      size:5+Math.random()*7,rot:Math.random()*6,vr:(Math.random()-.5)*0.4,color:COLORS[i%COLORS.length],life:60+Math.random()*40});}
  if(!raf)raf=requestAnimationFrame(stepConfetti);
}
function stepConfetti(){
  cx.clearRect(0,0,cv.width,cv.height);
  parts=parts.filter(p=>p.life>0&&p.y<cv.height+20);
  parts.forEach(p=>{p.vy+=p.g;p.x+=p.vx;p.y+=p.vy;p.rot+=p.vr;p.life--;
    cx.save();cx.translate(p.x,p.y);cx.rotate(p.rot);cx.fillStyle=p.color;
    cx.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.6);cx.restore();});
  if(parts.length)raf=requestAnimationFrame(stepConfetti);else raf=null;
}

let actx;
function ac(){if(!actx)actx=new (window.AudioContext||window.webkitAudioContext)();if(actx.state==="suspended")actx.resume();return actx;}
function tone(f,start,dur,type,gain){
  const a=ac(),o=a.createOscillator(),g=a.createGain();o.type=type||"sine";o.frequency.value=f;
  o.connect(g);g.connect(a.destination);const t=a.currentTime+start;
  g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(gain||0.18,t+0.012);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.start(t);o.stop(t+dur+0.02);}
function slide(f1,f2,start,dur,type,gain){
  const a=ac(),o=a.createOscillator(),g=a.createGain(),lp=a.createBiquadFilter();
  lp.type="lowpass";lp.frequency.value=1400;o.type=type||"sawtooth";
  const t=a.currentTime+start;o.frequency.setValueAtTime(f1,t);o.frequency.exponentialRampToValueAtTime(f2,t+dur);
  o.connect(lp);lp.connect(g);g.connect(a.destination);
  g.gain.setValueAtTime(gain||0.2,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.start(t);o.stop(t+dur+0.02);}
const N={C5:523,E5:659,G5:784,C6:1046,E6:1318,G6:1568,A5:880,D5:587,B5:988,G4:392};
const S={
  tick(){if(!soundOn)return;tone(720,0,0.07,"square",0.10);},
  chime(){if(!soundOn)return;tone(N.C5,0,0.12);tone(N.E5,0.07,0.14);},
  great(){if(!soundOn)return;[N.C5,N.E5,N.G5,N.C6].forEach((f,i)=>tone(f,i*0.07,0.16,"triangle",0.16));},
  epic(){if(!soundOn)return;[N.G4,N.C5,N.E5,N.G5,N.C6].forEach((f,i)=>tone(f,i*0.06,0.18,"sawtooth",0.12));[N.C6,N.E6].forEach((f,i)=>tone(f,0.32+i*0.06,0.2,"sine",0.14));},
  yahtzee(){if(!soundOn)return;
    [N.C5,N.E5,N.G5,N.C6,N.E6,N.G6].forEach((f,i)=>{tone(f,i*0.075,0.22,"sawtooth",0.11);tone(f,i*0.075,0.22,"sine",0.08);});
    [N.C6,N.G6,N.C6,N.E6,N.G6].forEach((f,i)=>tone(f,0.5+i*0.05,0.18,"triangle",0.12));},
  bonus(){if(!soundOn)return;this.yahtzee();[N.G4,N.C5,N.E5,N.G5,N.C6,N.E6,N.G6].forEach((f,i)=>tone(f,0.9+i*0.05,0.25,"square",0.07));},
  sad(){if(!soundOn)return;slide(294,247,0,0.22,"sawtooth",0.2);slide(262,220,0.26,0.22,"sawtooth",0.2);slide(233,196,0.52,0.22,"sawtooth",0.2);slide(208,140,0.78,0.5,"sawtooth",0.22);},
};

function syncActive(){document.querySelectorAll(".pcard").forEach(c=>c.classList.toggle("active",+c.dataset.p===activePlayer));updateStatus();}
document.querySelectorAll(".pcard").forEach(card=>card.addEventListener("click",e=>{
  if(e.target.classList.contains("pname"))return;activePlayer=+card.dataset.p;syncActive();}));

const scrim=document.getElementById("scrim"),entry=document.getElementById("entry");
let cur={p:null,k:null};
function openEntry(p,k){
  ac();cur={p,k};const c=META[k],pname=nameOf(p),die=c.face?dieHTML(c.face):"";
  let body="";
  if(c.type==="count"){
    let btns="";for(let n=0;n<=5;n++)btns+=`<button class="countbtn" data-n="${n}"><span class="n">${n}</span><span class="v">= ${n*c.face}</span></button>`;
    body=`<p class="eodds">How many ${c.name.toLowerCase()} did ${pname} roll?</p><div class="countgrid">${btns}</div>
      <button class="bigbtn scratch" data-v="0" style="width:100%;margin-top:10px;">Scratch this box · 0</button>`;
  }else if(c.type==="fixed"){
    body=`<p class="eodds">${c.hint}</p><div class="fixedwrap">
      <button class="bigbtn score" data-v="${c.value}">Score ${c.value}</button>
      <button class="bigbtn scratch" data-v="0">Scratch · 0</button></div>`;
  }else if(c.type==="bonus"){
    const have=val(p,k)||0;
    body=`<p class="eodds">Extra Yahtzee = +100 and a full extra turn to even up. Currently +${have}.</p><div class="fixedwrap">
      <button class="bigbtn add" data-add="100">Add +100 🎉</button>
      <button class="bigbtn scratch" data-v="0">Reset · 0</button></div>`;
  }else{
    body=`<p class="eodds">${c.hint}. Enter the total of all 5 dice (0–${c.max}).</p>
      <div class="padshow" id="padShow">0</div>
      <div class="pad">${[1,2,3,4,5,6,7,8,9].map(d=>`<button class="key" data-d="${d}">${d}</button>`).join("")}</div>
      <div class="padrow2"><button class="key wide" data-back="1">⌫ Back</button><button class="key" data-d="0">0</button></div>
      <button class="bigbtn score" id="padConfirm" style="width:100%;margin-top:8px;">Save score</button>
      <button class="bigbtn scratch" data-v="0" style="width:100%;margin-top:8px;">Scratch this box · 0</button>`;
  }
  const clr=state[p][k]?`<div class="clearcell"><button id="clearBtn">Clear this entry</button></div>`:"";
  entry.innerHTML=`<div class="grab"></div><div class="ehead">${die}<div><div class="etitle">${c.name}</div><div class="ewho p${p}">${pname}</div></div></div>${body}${clr}`;
  wireEntry(c);scrim.classList.add("open");
}
function closeEntry(){scrim.classList.remove("open");}
scrim.addEventListener("click",e=>{if(e.target===scrim)closeEntry();});
function wireEntry(c){
  const cb=document.getElementById("clearBtn");if(cb)cb.onclick=()=>{clearScore(cur.p,cur.k);closeEntry();};
  // generic value buttons: fixed "Score", every "Scratch", bonus "Reset"
  entry.querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>{record(cur.p,cur.k,+b.dataset.v);closeEntry();});
  if(c.type==="count"){
    entry.querySelectorAll(".countbtn").forEach(b=>b.onclick=()=>{record(cur.p,cur.k,(+b.dataset.n)*c.face);closeEntry();});
  }else if(c.type==="bonus"){
    entry.querySelector("[data-add]").onclick=()=>{const have=val(cur.p,cur.k)||0;record(cur.p,cur.k,have+100);closeEntry();};
  }else if(c.type==="sum"){
    let buf="";const show=document.getElementById("padShow"),draw=()=>show.textContent=buf===""?"0":buf;
    entry.querySelectorAll("[data-d]").forEach(k=>k.onclick=()=>{let n=(buf+k.dataset.d).replace(/^0+/,"");if(n==="")buf="0";else if(+n<=c.max)buf=n;draw();});
    entry.querySelector("[data-back]").onclick=()=>{buf=buf.slice(0,-1);draw();};
    document.getElementById("padConfirm").onclick=()=>{record(cur.p,cur.k,buf===""?0:+buf);closeEntry();};
  }
}
document.querySelectorAll(".cell[data-key]").forEach(cell=>cell.addEventListener("click",()=>openEntry(+cell.dataset.p,cell.dataset.key)));

document.getElementById("soundBtn").addEventListener("click",function(){soundOn=!soundOn;this.textContent=soundOn?"🔊":"🔇";if(soundOn){ac();S.chime();}});
document.getElementById("dataBtn").addEventListener("click",()=>{
  ac();const names=[...document.querySelectorAll(".pname")].map(e=>e.value);
  const rec={gameId:"game_"+Math.random().toString(36).slice(2,8),startedAt:new Date().toISOString().slice(0,10),
    players:[0,1].map(p=>({name:names[p],totals:compute(p),
      bonusYahtzees:state[p].yahtzeeBonus?Math.round(state[p].yahtzeeBonus.value/100):0,
      entries:Object.entries(state[p]).map(([cat,s])=>({category:cat,value:s.value,order:s.order,recordedAt:s.ts})).sort((a,b)=>a.order-b.order)}))};
  entry.innerHTML=`<div class="grab"></div><div class="ehead"><div><div class="etitle">Captured game data</div><div class="ewho" style="color:var(--ink-soft)">What gets saved for analysis</div></div></div>
    <p class="data-note">Each entry stores its <b>value</b>, the <b>order</b> it was recorded, and a timestamp — the raw material for per-player stats and AI later.</p>
    <div class="data-json">${JSON.stringify(rec,null,2).replace(/</g,"&lt;")}</div>`;
  scrim.classList.add("open");
});
document.getElementById("newBtn").addEventListener("click",()=>{
  if(orderCounter>0&&!confirm("Start a new game? Current scores clear."))return;
  fresh();refresh();syncActive();
});

refresh();syncActive();
