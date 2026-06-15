// User-defined commentary triggers — authored in ⚙️, stored in localStorage, no code changes.
// A rule: { id, when: { type, ...fields, player? }, lines: [string], enabled }
// These take PRIORITY over the AI: commentary checks lineFor(ctx) before calling Claude.
//
// Trigger types:
//   value         { value }                 a specific score value was just recorded
//   category      { category }              a specific box was filled (categoryKey)
//   categoryValue { category, value }        category + value together
//   scratch       {}                         any box scratched to 0
//   event         { event }                  yahtzee | bonusYahtzee | gameOver
//   (player)      { ..., player }            optional extra filter: 'dan' | 'amber' | 'any' (a name, lowercased)
//
// Placeholders, substituted at fire time:
//   {scorer} {opponent} {value} {category} {scorerTotal} {opponentTotal} {leader} {margin}

const KEY = 'yz_custom_triggers';
let rules = [];
const lastLine = {};   // ruleId -> last line spoken (avoid immediate repeats)

function ruleMatches(w, ctx) {
  if (w.player && w.player !== 'any') {
    if (String(ctx.scorer || '').toLowerCase() !== String(w.player).toLowerCase()) return false;
  }
  switch (w.type) {
    case 'value': return ctx.value === w.value;
    case 'category': return ctx.categoryKey === w.category;
    case 'categoryValue': return ctx.categoryKey === w.category && ctx.value === w.value;
    case 'scratch': return ctx.justScratched === true;
    case 'event':
      if (w.event === 'yahtzee') return !!ctx.justYahtzee;
      if (w.event === 'bonusYahtzee') return !!ctx.justBonus;
      if (w.event === 'gameOver') return !!ctx.gameOver;
      return false;
    default: return false;
  }
}

// Higher = more specific. Ties break on rule order (earliest wins).
function specificity(w) {
  let s;
  switch (w.type) {
    case 'categoryValue': s = 5; break;
    case 'value': s = 4; break;
    case 'event': s = 4; break;
    case 'category': s = 3; break;
    case 'scratch': s = 2; break;
    default: s = 1;
  }
  if (w.player && w.player !== 'any') s += 1;
  return s;
}

// Pure: pick the most-specific enabled rule that matches, or null.
export function selectRule(list, ctx) {
  let best = null, bestScore = -1;
  for (const r of list) {
    if (r.enabled === false) continue;
    if (!ruleMatches(r.when || {}, ctx)) continue;
    const s = specificity(r.when || {});
    if (s > bestScore) { best = r; bestScore = s; }   // strict > keeps the earliest on ties
  }
  return best;
}

export function substitute(line, ctx) {
  const map = {
    scorer: ctx.scorer ?? ctx.winner ?? '',
    opponent: ctx.opponent ?? ctx.loser ?? '',
    value: ctx.value != null ? String(ctx.value) : '',
    category: ctx.category ?? '',
    scorerTotal: ctx.scorerTotal != null ? String(ctx.scorerTotal) : (ctx.winScore != null ? String(ctx.winScore) : ''),
    opponentTotal: ctx.opponentTotal != null ? String(ctx.opponentTotal) : (ctx.loseScore != null ? String(ctx.loseScore) : ''),
    leader: ctx.leader ?? ctx.winner ?? '',
    margin: ctx.margin != null ? String(ctx.margin) : '',
  };
  return (line || '').replace(/\{(scorer|opponent|value|category|scorerTotal|opponentTotal|leader|margin)\}/g, (_, k) => map[k] ?? '');
}

// Pick a line at random, avoiding an immediate repeat when there's an alternative.
export function pickLine(lines, last) {
  if (!lines || !lines.length) return null;
  if (lines.length === 1) return lines[0];
  let pick = lines[Math.floor(Math.random() * lines.length)];
  if (pick === last) {
    const others = lines.filter(l => l !== last);
    pick = others[Math.floor(Math.random() * others.length)] || pick;
  }
  return pick;
}

export const CustomTriggers = {
  load() { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); rules = Array.isArray(a) ? a : []; } catch { rules = []; } return rules; },
  save() { try { localStorage.setItem(KEY, JSON.stringify(rules)); } catch { /* ignore */ } },
  all() { return rules; },
  add(rule) {
    const r = { id: 'ct_' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36), enabled: true, ...rule };
    rules.push(r); this.save(); return r;
  },
  update(id, patch) { const r = rules.find(x => x.id === id); if (r) { Object.assign(r, patch); this.save(); } return r; },
  remove(id) { rules = rules.filter(x => x.id !== id); this.save(); },

  // Ready-to-speak line for ctx (most-specific match, substituted), or null to fall through to the AI.
  lineFor(ctx) {
    const r = selectRule(rules, ctx);
    if (!r) return null;
    const line = pickLine(r.lines || [], lastLine[r.id]);
    if (line == null) return null;
    lastLine[r.id] = line;
    return substitute(line, ctx);
  },
};
