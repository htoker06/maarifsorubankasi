// Mobil motorun Python motoruyla aynı sonucu verdiğini doğrular.
// Önce: python tests/export_js_fixtures.py   Sonra: node --test mobil/test/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultConfig } from '../js/engine/config.js';
import { SignalAnalyzer } from '../js/engine/analyzer.js';
import { addIndicators } from '../js/engine/indicators.js';
import { buildProxyIndices, evaluateRegime } from '../js/engine/macro.js';

const fx = JSON.parse(readFileSync(new URL('./fixtures.json', import.meta.url), 'utf8'));
const close = (a, b, tol = 1e-6) => (a === null || b === null ? a === b : Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)));

test('indikatörler Python ile aynı', () => {
  const df = addIndicators(fx.indicators.daily, defaultConfig());
  for (const [col, exp] of Object.entries(fx.indicators.expected)) {
    exp.forEach((v, i) => {
      const got = Number.isFinite(df[col][i]) ? df[col][i] : null;
      assert.ok(close(got, v, 1e-7), `${col}[${i}]: js=${got} py=${v}`);
    });
  }
});

for (const c of fx.cases) {
  test(`analiz: ${c.name}`, () => {
    const md = { ...c.md, trades: c.md.trades || null };
    const sig = new SignalAnalyzer(defaultConfig()).analyze(md, c.macro, c.deriv);
    const e = c.expected;
    assert.deepEqual(sig.gates.map((g) => [g.name, g.passed]), e.gates);
    assert.equal(sig.passed, e.passed);
    assert.deepEqual(sig.patterns.map((p) => [p.name, p.breakout_age]), e.patterns.map((p) => [p[0], p[1]]));
    sig.patterns.forEach((p, i) => assert.ok(close(p.quality, e.patterns[i][2]), `${p.name} kalite`));
    assert.ok(close(sig.score, e.score), `skor js=${sig.score} py=${e.score}`);
    assert.ok(close(sig.base_score, e.base_score));
    for (const [k, v] of Object.entries(e.components)) assert.ok(close(sig.components[k], v, 1e-4), k);
    if (e.trap_risk !== null) assert.ok(close(sig.manipulation.trap_risk, e.trap_risk));
    if (e.stop !== null) {
      assert.ok(close(sig.plan.stop, e.stop), 'stop');
      assert.deepEqual(sig.plan.targets.map((t) => t[0]), e.targets.map((t) => t[0]));
      sig.plan.targets.forEach((t, i) => assert.ok(close(t[1], e.targets[i][1]), 'hedef'));
    }
  });
}

test('makro rejim Python ile aynı', () => {
  const m = fx.macro;
  const cfg = defaultConfig().macro;
  const ind = buildProxyIndices(m.closes, m.caps, m.stables);
  const st = evaluateRegime(m.closes.BTC.close, ind, cfg, null);
  const e = m.expected;
  assert.equal(st.score, e.score);
  assert.equal(st.locked, e.locked);
  assert.equal(st.regime, e.regime);
  assert.ok(close(st.btc_dom_slope, e.btc_dom_slope));
  assert.ok(close(st.usdt_dom_slope, e.usdt_dom_slope));
  assert.ok(close(st.total3_slope, e.total3_slope));
  assert.ok(close(ind.total3.at(-1), e.total3_last));
  assert.ok(close(ind.btc_d.at(-1), e.btc_d_last));
});
