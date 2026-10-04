// Motor ayarları. Anahtarlar Python sürümündeki (breakout_engine/config.py) ile birebir aynıdır.

export function defaultConfig() {
  return {
    exchange: {
      quote: 'USDT',
      max_concurrency: 6,
      max_retries: 3,
      history_days: 1000,
      excluded_bases: [
        'USDC', 'FDUSD', 'TUSD', 'BUSD', 'DAI', 'USDP', 'USDD', 'EUR', 'TRY',
        'AEUR', 'EURI', 'USD1', 'PAXG', 'WBTC', 'WBETH', 'BFUSD', 'XUSD',
      ],
    },
    macro: {
      index_components: 20, ema_fast: 20, ema_slow: 50, slope_lookback: 5,
      btc_ma_fast: 50, btc_ma_slow: 200, risk_on_threshold: 65, risk_off_threshold: 40,
    },
    liquidity: {
      min_quote_volume_24h: 5_000_000, depth_pct: 0.02, min_depth_usd_each_side: 50_000,
      max_spread_pct: 0.002, max_slippage_pct: 0.005, slippage_probe_usd: 10_000,
    },
    setup: {
      min_history_bars: 260, ath_min_drawdown: 0.70, require_ath_drawdown: true,
      bb_period: 20, bb_std: 2.0, bbw_percentile_lookback: 365, bbw_max_percentile: 0.15,
      squeeze_window: 90, base_min_days: 30, base_max_days: 180, base_max_range: 0.60,
      ma_period: 200, ma_cross_max_age: 5, ma_hold_bars: 1, max_extension_above_ma: 0.25,
      breakout_max_age: 3, rsi_period: 14, rsi_min: 50, rsi_max: 65, rsi_breakout_day_max: 68,
      macd_zero_cross_lookback: 10, volume_avg_period: 20, volume_spike_mult: 2.5, vwap_period: 20,
    },
    pattern: {
      pivot_left: 5, pivot_right: 5, pattern_lookback: 180, bottom_tolerance: 0.05,
      min_bottom_separation: 10, shoulder_tolerance: 0.12, min_head_depth: 0.05,
      wedge_min_touches: 2, rounding_min_r2: 0.60, trendline_lookback: 90, donchian_period: 90,
    },
    manipulation: {
      min_body_ratio: 0.75, max_upper_wick_ratio: 0.15, close_position_min: 0.80,
      sweep_lookback: 20, sweep_min_lower_wick: 0.45,
      trade_size_spike_max: 3.0, min_trades_growth: 1.5, max_trade_hhi: 0.05,
      max_top1pct_share: 0.35, max_repeat_size_share: 0.20, max_ping_pong_share: 0.15,
      max_wash_risk: 0.45, max_funding_rate: 0.0005, max_oi_growth_with_hot_funding: 0.25,
      min_taker_buy_ratio: 0.52, wall_mult: 8.0, min_bid_ask_depth_ratio: 0.40,
      book_snapshots: 3, book_snapshot_interval_s: 2.0, wall_vanish_ratio: 0.30,
      max_trap_risk: 0.40, strict_missing_data: true,
    },
    smart_money: {
      divergence_window: 60, cmf_period: 20, profile_days: 180, profile_bins: 60,
      poc_volume_mult: 3.0, poc_volume_avg_period: 30, poc_cross_max_age: 5,
    },
    scoring: {
      w_volume: 0.30, w_accumulation: 0.25, w_ma200: 0.20, w_momentum: 0.15, w_macro: 0.10,
      trap_penalty: 0.50, min_score: 85,
    },
    risk: {
      atr_period: 14, stop_buffer_atr: 0.25, max_risk_pct: 0.15,
      tranche_weights: [0.30, 0.40, 0.30], r_targets: [1.5, 3.0], min_rr_tp2: 2.0,
    },
  };
}

/** Varsayılan ayarların üzerine kısmi ayarları derinlemesine yazar. */
export function mergeConfig(base, overrides) {
  const out = structuredClone(base);
  for (const [section, values] of Object.entries(overrides || {})) {
    if (!(section in out)) continue;
    for (const [k, v] of Object.entries(values || {})) {
      if (k in out[section]) out[section][k] = v;
    }
  }
  return out;
}
