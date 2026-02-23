const PRESETS = {
  'turnaround-value': {
    name: 'turnaround-value',
    description: '턴어라운드 밸류 — 52주 저점 근처 + P/E<30 (바닥 매수 후보)',
    finvizFilters: 'cap_smallover,fa_pe_u30,ta_highlow52w_b10h,geo_usa',
    finvizUrl: 'https://finviz.com/screener.ashx?v=111&f=cap_smallover,fa_pe_u30,ta_highlow52w_b10h,geo_usa&ft=4',
  },
  'turnaround-growth': {
    name: 'turnaround-growth',
    description: '턴어라운드 그로스 — 52주 하락 + 최근 26주 반등 + QoQ 매출성장 (변곡점)',
    finvizFilters: 'cap_smallover,fa_salesqoq_o5,ta_perf_52w_u0,ta_perf_26w_o0,geo_usa',
    finvizUrl: 'https://finviz.com/screener.ashx?v=111&f=cap_smallover,fa_salesqoq_o5,ta_perf_52w_u0,ta_perf_26w_o0,geo_usa&ft=4',
  },
  'turnaround-profitability': {
    name: 'turnaround-profitability',
    description: '턴어라운드 수익성 — 아직 적자이지만 EPS 성장 25%+ (흑자 전환 임박)',
    finvizFilters: 'cap_smallover,fa_epsyoy1_o25,fa_opermargin_neg,geo_usa',
    finvizUrl: 'https://finviz.com/screener.ashx?v=111&f=cap_smallover,fa_epsyoy1_o25,fa_opermargin_neg,geo_usa&ft=4',
  },
};

function getPreset(name) {
  return PRESETS[name] || null;
}

function listPresets() {
  return Object.values(PRESETS);
}

module.exports = { getPreset, listPresets };
