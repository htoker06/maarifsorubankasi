// Risk planı: alım bölgesi, kademeli giriş, stop ve R:R hedefleri (risk.py karşılığı).

export function buildPlan(df, breakoutIdx, pattern, cfg, resistances) {
  const n = df.close.length;
  const close = df.close[n - 1];
  const atr = df.atr[n - 1];
  const level = Math.min(pattern.breakout_level, close);
  const t1 = close;
  const t2 = Math.min(level * 1.005, close - 0.25 * atr);
  const t3 = Math.min(t2, level) - 0.25 * atr;
  const [w1, w2, w3] = cfg.tranche_weights;
  const tranches = [[t1, w1], [t2, w2], [t3, w3]];
  const avg = tranches.reduce((a, [p, w]) => a + p * w, 0) / (w1 + w2 + w3);

  const candidates = [df.low[breakoutIdx], pattern.invalidation];
  const below = candidates.filter((c) => c < t3 * 0.995);
  const baseStop = below.length ? Math.max(...below) : t3 * 0.97;
  const stop = baseStop - cfg.stop_buffer_atr * atr;
  const risk = avg - stop;
  const riskPct = avg > 0 ? risk / avg : Infinity;

  const targets = cfg.r_targets.map((r) => [`${r}R`, avg + r * risk, r]);
  const measured = pattern.breakout_level + pattern.height;
  if (measured > avg + risk) targets.push(['Ölçülen Hareket', measured, (measured - avg) / risk]);
  for (const res of resistances || []) {
    if (res > avg + risk) { targets.push(['Hacim Direnci (HVN)', res, (res - avg) / risk]); break; }
  }
  targets.sort((a, b) => a[1] - b[1]);
  const bestR = Math.max(...targets.map((t) => t[2]));
  const rrOk = stop > 0 && risk > 0 && riskPct <= cfg.max_risk_pct && bestR >= cfg.min_rr_tp2;
  return { entry_ref: close, buy_zone: [t3, t1], tranches, avg_entry: avg, stop, risk_pct: riskPct, targets, rr_ok: rrOk };
}
