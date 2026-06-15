// Stats screen: reads db.allFinished(), computes pure stats, and renders cards + Chart.js charts.
// Chart.js is dynamically imported (still bundled by Vite + precached) so it loads only when the
// screen is opened. Toggling never touches the in-progress game DOM.
import { allFinished } from '../db.js';
import { computeStats } from '../game/stats.js';
import { BASE_KEYS, META } from '../game/categories.js';

const COLORS = ['#2E7CF6', '#FF5A47', '#7C5CFC', '#22C9A0'];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let charts = [];

function destroyCharts() { charts.forEach(c => { try { c.destroy(); } catch { /* ignore */ } }); charts = []; }
const colorFor = (s, name) => COLORS[Math.max(0, s.names.indexOf(name)) % COLORS.length];
function fmtDur(ms) { if (!ms) return '—'; const sec = Math.round(ms / 1000); return `${Math.floor(sec / 60)}m ${sec % 60}s`; }
const esc = (s) => String(s).replace(/</g, '&lt;');

const card = (val, label) => `<div class="statcard"><div class="sv">${esc(val)}</div><div class="sl">${esc(label)}</div></div>`;
const tally = (s, obj) => s.names.map(n => `${n} ${obj[n] || 0}`).join(' · ');

function statsHTML(s) {
  const h2h = s.names.map(n => `${n} ${s.headToHead.winsByName[n] || 0}`).join(' – ') + (s.headToHead.ties ? ` (${s.headToHead.ties}t)` : '');
  const c = s.counters;
  return `
    <div class="statcards">
      ${card(s.totalGames, 'games')}
      ${card(h2h, 'head-to-head')}
      ${card(s.streak.length ? `${s.streak.name} ×${s.streak.length}` : '—', 'win streak')}
      ${card(s.lastWinner, 'last winner')}
    </div>
    <div class="chartgrid">
      <div class="chartbox"><div class="ct">Win share</div><div class="cwrap"><canvas id="winDonut"></canvas></div></div>
      <div class="chartbox"><div class="ct">Grand total over time</div><div class="cwrap"><canvas id="totalsLine"></canvas></div></div>
      <div class="chartbox wide"><div class="ct">Average by category</div><div class="cwrap"><canvas id="catBar"></canvas></div></div>
      <div class="chartbox"><div class="ct">Final-score distribution</div><div class="cwrap"><canvas id="histo"></canvas></div></div>
    </div>
    <div class="statcards">
      ${card(c.bestGame.name ? `${c.bestGame.score} · ${c.bestGame.name}` : '—', 'best game')}
      ${card(c.worstMeltdown.name ? `${c.worstMeltdown.score} · ${c.worstMeltdown.name}` : '—', 'worst meltdown')}
      ${card(c.biggestBlowout.winner ? `+${c.biggestBlowout.margin} · ${c.biggestBlowout.winner}` : '—', 'biggest blowout')}
      ${card(c.closestGame.winner ? `+${c.closestGame.margin} · ${c.closestGame.winner}` : '—', 'closest game')}
      ${card(tally(s, c.yahtzees), 'Yahtzees')}
      ${card(tally(s, c.bonusYahtzees), 'bonus Yahtzees')}
      ${card(c.mostScratchedCategory.category ? `${c.mostScratchedCategory.name} ×${c.mostScratchedCategory.count}` : '—', 'most scratched')}
      ${card(fmtDur(c.avgDurationMs), 'avg duration')}
    </div>`;
}
const emptyHTML = () => `<div class="statsempty"><div class="se-glyph">🎲📊</div>
  <div class="se-t">No finished games yet</div><div class="se-s">Play and finish a game to unlock stats.</div></div>`;

async function drawCharts(s) {
  const { Chart, registerables } = await import('chart.js');
  Chart.register(...registerables);
  const animation = reduced() ? false : undefined;
  const base = { responsive: true, maintainAspectRatio: false, animation, plugins: { legend: { labels: { font: { family: 'Fredoka' }, boxWidth: 12 } } } };
  const C = (el, cfg) => { const node = document.getElementById(el); if (node) charts.push(new Chart(node, cfg)); };

  C('winDonut', { type: 'doughnut', options: base, data: {
    labels: s.winShare.labels,
    datasets: [{ data: s.winShare.data, backgroundColor: [...s.names.map(n => colorFor(s, n)), '#cbc3b0'], borderColor: '#1A1B26', borderWidth: 2 }],
  } });
  C('totalsLine', { type: 'line', options: base, data: {
    labels: s.totalsOverTime.map(r => 'G' + r.n),
    datasets: s.names.map(n => ({ label: n, data: s.totalsOverTime.map(r => r[n] ?? null), borderColor: colorFor(s, n), backgroundColor: colorFor(s, n), tension: 0.25, spanGaps: true })),
  } });
  C('catBar', { type: 'bar', options: { ...base, scales: { x: { ticks: { font: { size: 9 } } } } }, data: {
    labels: BASE_KEYS.map(k => META[k].name),
    datasets: s.names.map(n => ({ label: n, data: BASE_KEYS.map(k => s.avgByCategory[n][k]), backgroundColor: colorFor(s, n) })),
  } });
  C('histo', { type: 'bar', options: { ...base, plugins: { legend: { display: false } } }, data: {
    labels: s.finalScoreHistogram.labels,
    datasets: [{ label: 'final scores', data: s.finalScoreHistogram.data, backgroundColor: '#7C5CFC' }],
  } });
}

export async function openStats() {
  const screen = document.getElementById('statsScreen'), body = document.getElementById('statsBody');
  destroyCharts();
  let data = [];
  try { data = await allFinished(); } catch { data = []; }
  const s = computeStats(data);
  body.innerHTML = s.totalGames ? statsHTML(s) : emptyHTML();
  screen.classList.add('open');
  if (s.totalGames) await drawCharts(s);
}
export function closeStats() { destroyCharts(); document.getElementById('statsScreen').classList.remove('open'); }
