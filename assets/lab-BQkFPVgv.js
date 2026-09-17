/* empty css                  */import{D as h}from"./capture-Cnkd4T2-.js";const t=new h;let $=0;const p=e=>String(e).replace(/[&<>"']/g,a=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[a]);document.body.innerHTML=`<main class="dice-lab"><a class="core-legacy" href="/">← Back to game</a>
 <div class="intro-kicker">HARDWARE PREPARATION</div><h1>Dice capture lab</h1>
 <p class="simulation-note">Simulation only · No Bluetooth connection or game scores are changed here.</p>
 <p class="core-muted">Test five-dice capture, held dice and disconnects before connecting real hardware. The GoDice API adapter is pending commercial licence clarification.</p>
 <div id="labState"></div><p id="labNotice" role="status" aria-live="polite"></p>
 <details><summary>Recent diagnostic events</summary><pre id="labLog"></pre></details>
 <button class="hbtn" data-lab="export">Export test trace</button></main>`;const r=document.getElementById("labState"),m=e=>{document.getElementById("labNotice").textContent=e};function b(){const e=t.turn,a=e==null?void 0:e.round,c=t.candidate();r.innerHTML=`<div class="lab-actions">
  <button class="hbtn" data-lab="connect" ${t.devices.size?"disabled":""}>Connect five test dice</button>
  <button class="hbtn" data-lab="start" ${e?"disabled":""}>Start test turn · 3 rolls</button>
  <button class="hbtn" data-lab="end" ${e?"":"disabled"}>End test turn</button></div>
  <p>${e?`Test player · ${e.accepted.length} / ${e.limit} rolls accepted`:"No active test turn"}</p>
  ${e!=null&&e.paused?`<p role="alert">${p(e.paused)} End this test turn and start again after reconnecting.</p>`:""}
  <div class="lab-dice">${[...t.devices.values()].map((n,l)=>`<section class="lab-die">
   <h2>Die ${l+1}</h2><p>${p(n.state)} · face ${n.face??"—"}</p>
   <label>Test face<select data-face="${l}" aria-label="Die ${l+1} test face">${[1,2,3,4,5,6].map(i=>`<option ${i===(n.face||l+1)?"selected":""}>${i}</option>`).join("")}</select></label>
   <label><input type="checkbox" data-held="${l}" ${a!=null&&a.held[l]?"checked":""} ${!(e!=null&&e.accepted.length)||a?"disabled":""}> Hold die ${l+1}</label>
   <div class="lab-actions"><button class="hbtn" data-lab="moving" data-die="${l}" ${n.connected?"":"disabled"}>Move</button>
   <button class="hbtn" data-lab="stable" data-die="${l}" ${n.connected?"":"disabled"}>Settle</button>
   <button class="hbtn" data-lab="tilted" data-die="${l}" ${n.connected?"":"disabled"}>Tilt</button>
   <button class="hbtn" data-lab="${n.connected?"disconnect":"reconnect"}" data-die="${l}">${n.connected?"Disconnect":"Reconnect"}</button></div></section>`).join("")}</div>
  <div class="lab-actions"><button class="hbtn" data-lab="arm" ${!e||e.paused||a||e.accepted.length>=e.limit?"disabled":""}>Arm next roll</button>
  <button class="hbtn" data-lab="all" ${!a||e.paused?"disabled":""}>Simulate roll and settle</button>
  <button class="hbtn" data-lab="cancel" ${a?"":"disabled"}>Cancel capture</button></div>
  <p>${c?`Ready: ${c.dice.join(" · ")}`:a!=null&&a.invalid.size?"A held die moved. Cancel capture and try again.":a?"Waiting for fresh movement and settled readings.":"Arm a roll before moving the dice."}</p>
  <button class="bigbtn score core-primary" data-lab="accept" ${c?"":"disabled"}>Accept test roll</button>`,document.getElementById("labLog").textContent=t.log.slice(-30).map(n=>JSON.stringify(n)).join(`
`)}function d(e,a,c){var l,i;const n=t.devices.get(`test-${e}`);t.receive({id:n.id,epoch:n.epoch,kind:a,face:c,token:(i=(l=t.turn)==null?void 0:l.round)==null?void 0:i.token})}document.addEventListener("click",e=>{const a=e.target.closest("[data-lab]");if(!a)return;const c=a.dataset.lab,n=Number(a.dataset.die),l=[...r.querySelectorAll("[data-face]")].map(o=>Number(o.value)),i=[...r.querySelectorAll("[data-held]")].map(o=>o.checked);try{if(c==="connect")for(let o=0;o<5;o++)t.connect(`test-${o}`);if(c==="start"&&t.start({turnId:`test-turn-${++$}`,playerId:"test-player"}),c==="end"&&t.end(),c==="arm"&&t.arm(i),c==="cancel"&&t.cancel(),c==="accept"&&t.accept(),c==="disconnect"&&t.disconnect(`test-${n}`,t.devices.get(`test-${n}`).epoch),c==="reconnect"&&t.connect(`test-${n}`),["moving","stable","tilted"].includes(c)&&d(n,c,l[n]),c==="all")for(let o=0;o<5;o++)t.turn.round.held[o]||(d(o,"moving"),d(o,"stable",l[o]));if(c==="export"){const o={schema:1,source:"simulation",exportedAt:new Date().toISOString(),truncatedToLast:500,events:t.log},u=URL.createObjectURL(new Blob([JSON.stringify(o,null,2)],{type:"application/json"})),s=document.createElement("a");s.href=u,s.download="dice-capture-test.json",s.click(),setTimeout(()=>URL.revokeObjectURL(u),1e3)}m(""),b()}catch(o){m(o.message)}});document.addEventListener("visibilitychange",()=>{document.hidden&&(t.pause("App moved to the background."),b())});b();
