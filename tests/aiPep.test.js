// @vitest-environment jsdom
// AI commentary line generation: request shaping (roast both, rich context), tag-aware parsing,
// escalation mapping, dedup, abort, and the no-key path — fetch stubbed.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AIPep, parseLine, stripTags, savageryLevel, buildUserMessage, ANGLES } from '../src/ui/aiPep.js';

let calls;
function stubFetch(textOut) {
  calls = [];
  globalThis.fetch = vi.fn(async (url, opts) => {
    calls.push({ url, opts });
    if (opts.signal && opts.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: textOut }] }) };
  });
}
const baseCtx = (over = {}) => ({
  level: 4, scorer: 'Dan', opponent: 'Amber', category: 'Chance', value: 5, wasChance: true,
  scorerTotal: 80, opponentTotal: 120, leader: 'Amber', margin: 40, comeback: 'Amber just TOOK the lead',
  scorerBonusSecured: false, scorerBonusDist: 10, opponentBonusSecured: true, opponentBonusDist: 0,
  scorerBoxesLeft: 6, opponentBoxesLeft: 5, needToWin: 'Dan needs 40 back.', jabs: ['Dan scratched Aces'], ...over,
});

beforeEach(() => { localStorage.clear(); AIPep.setKey(''); AIPep.setEnabled(false); });

describe('escalation + parsing', () => {
  it('maps progress to L1..L5 and clamps to the cap', () => {
    expect([0, 0.25, 0.5, 0.7, 0.95].map(p => savageryLevel(p))).toEqual([1, 2, 3, 4, 5]);
    expect(savageryLevel(0.95, 2)).toBe(2);
    expect(savageryLevel(0.95, 1)).toBe(1);
  });
  it('keeps v3 tags in tagged, strips them in plain', () => {
    const r = parseLine('[dryly] Dan, bold of you to use Chance on a 5. [laughs]');
    expect(r.tagged).toContain('[dryly]');
    expect(r.plain).toBe('Dan, bold of you to use Chance on a 5.');
    expect(stripTags('[low] go [whispers] now')).toBe('go now');
  });
});

describe('prompt content (roast both, situational)', () => {
  it('system roasts BOTH players (no Amber-always-hero)', () => {
    expect(AIPep).toBeTruthy();
    const msg = buildUserMessage(baseCtx());
    expect(msg).toMatch(/Dan just scored Chance for 5/);
    expect(msg).toMatch(/Totals now: Dan 80, Amber 120/);
    expect(msg).toMatch(/Amber leads by 40/);
    expect(msg).toMatch(/COMEBACK: Amber just TOOK the lead/);
    expect(msg).toMatch(/Jab fodder: Dan scratched Aces/);
    expect(msg).toMatch(/Savagery level 4/);
  });
  it('builds a game-over closing message', () => {
    const msg = buildUserMessage({ gameOver: true, winner: 'Amber', loser: 'Dan', winScore: 250, loseScore: 210, level: 5 });
    expect(msg).toMatch(/GAME OVER. Amber beat Dan 250 to 210/);
    expect(msg).toMatch(/hype the winner and roast the loser/);
  });
});

describe('generateLine', () => {
  it('returns null without a key (no fetch)', async () => {
    stubFetch('[dryly] x.');
    AIPep.setEnabled(true);
    expect(await AIPep.generateLine(baseCtx())).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('POSTs with the browser-access header + Haiku model and a both-player system prompt', async () => {
    stubFetch('[gleeful] Forty back, Dan? In this economy?');
    AIPep.setKey('sk-ant-secret-1234'); AIPep.setEnabled(true);
    const line = await AIPep.generateLine(baseCtx());
    expect(line.tagged).toContain('[gleeful]');
    expect(line.plain).not.toContain('[');
    const { url, opts } = calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(opts.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(opts.headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse(opts.body);
    expect(body.model).toBe('claude-haiku-4-5-20251001');
    expect(body.system).toMatch(/Roast EITHER player/);
    expect(body.system).not.toMatch(/always (the )?hero/i);
    expect(body.messages[0].content).toMatch(/COMEBACK/);
  });

  it('a verbatim duplicate retries, then accepts rather than going silent', async () => {
    stubFetch('Dan, that is a personality choice, not a strategy.');
    AIPep.setKey('sk-ant-k'); AIPep.setEnabled(true);
    expect((await AIPep.generateLine(baseCtx())).plain).toBeTruthy();
    const second = await AIPep.generateLine(baseCtx());   // dup on attempt 0 -> retry -> accept (no silent null)
    expect(second).not.toBeNull();
    expect(second.plain).toBeTruthy();
  });

  it('returns null when aborted', async () => {
    stubFetch('[low] never spoken');
    AIPep.setKey('sk-ant-k2'); AIPep.setEnabled(true);
    const ac = new AbortController(); ac.abort();
    expect(await AIPep.generateLine(baseCtx(), { signal: ac.signal })).toBeNull();
  });
});

describe('spontaneity: rotating angle + self-memory', () => {
  it('injects a delivery persona each call and never repeats it back-to-back', async () => {
    let i = 0; calls = [];
    globalThis.fetch = vi.fn(async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ content: [{ type: 'text', text: `unique ${++i}` }] }) }; });
    AIPep.setKey('sk-angle'); AIPep.setEnabled(true);
    await AIPep.generateLine(baseCtx());
    await AIPep.generateLine(baseCtx());
    const angleOf = (call) => ANGLES.find(a => JSON.parse(call.opts.body).messages[0].content.includes(a));
    const a0 = angleOf(calls[0]), a1 = angleOf(calls[1]);
    expect(a0).toBeTruthy();
    expect(a1).toBeTruthy();
    expect(a0).not.toBe(a1);
  });

  it('threads its recent lines into the next prompt', async () => {
    let i = 0; calls = [];
    globalThis.fetch = vi.fn(async (url, opts) => { calls.push({ url, opts }); return { ok: true, json: async () => ({ content: [{ type: 'text', text: i++ === 0 ? 'First witty line here.' : 'a different second line' }] }) }; });
    AIPep.setKey('sk-recent'); AIPep.setEnabled(true);
    expect((await AIPep.generateLine(baseCtx())).plain).toBe('First witty line here.');
    await AIPep.generateLine(baseCtx());
    expect(JSON.parse(calls[1].opts.body).messages[0].content).toContain('First witty line here.');
  });
});

describe('no truncation, no repeat, no silence', () => {
  it('retries on a duplicate instead of returning null (no silent turn)', async () => {
    let i = 0; const seq = ['Repeated line', 'Repeated line', 'A brand new line'];
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ content: [{ type: 'text', text: seq[i++] }] }) }));
    AIPep.setKey('sk-dup'); AIPep.setEnabled(true);
    expect((await AIPep.generateLine(baseCtx())).plain).toBe('Repeated line');   // primes `seen`
    expect((await AIPep.generateLine(baseCtx())).plain).toBe('A brand new line'); // dup -> retry -> fresh
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('requests max_tokens 150 (longer lines do not truncate)', async () => {
    stubFetch('a line');
    AIPep.setKey('sk-mt'); AIPep.setEnabled(true);
    await AIPep.generateLine(baseCtx());
    expect(JSON.parse(calls[0].opts.body).max_tokens).toBe(150);
  });
});

describe('rivalry + last-turn prompt threading', () => {
  const rivalry = { totalGames: 9, wins: { Dan: 3, Amber: 5 }, ties: 1, leader: 'Amber', streak: { name: 'Amber', length: 2 },
    lastWinner: 'Amber', avg: { Dan: 95, Amber: 162 }, bestGame: { name: 'Amber', score: 286 }, closestMargin: 4, biggestBlowout: { winner: 'Amber', margin: 120 } };

  it('includes the rivalry line when ctx.rivalry is present', () => {
    const msg = buildUserMessage({ ...baseCtx(), rivalry });
    expect(msg).toMatch(/RIVALRY HISTORY/);
    expect(msg).toMatch(/Career: Dan 3-5 Amber \(1 tie\) over 9 games/);
    expect(msg).toMatch(/Amber has won the last 2/);
    expect(msg).toMatch(/Career averages: Dan 95, Amber 162/);
    expect(msg).toMatch(/Record game: Amber 286/);
  });

  it('includes a last-turn note when ctx.scorerLastTurn is set', () => {
    expect(buildUserMessage({ ...baseCtx(), scorerLastTurn: true })).toMatch(/Dans LAST TURN, final box/);
    expect(buildUserMessage({ ...baseCtx(), opponentLastTurn: true })).toMatch(/Amber is down to their LAST box/);
  });
});
