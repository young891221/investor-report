const PRESETS = {
  'small-cap-growth': {
    name: 'small-cap-growth',
    description: '소형주 성장주 — 시총 $300M~$10B, ROE>10%, P/E<50, EPS성장>15%',
    finvizFilters: 'cap_smallover,fa_roe_o10,fa_pe_u50,fa_epsyoy1_o15,geo_usa',
    finvizUrl: 'https://finviz.com/screener.ashx?v=111&f=cap_smallover,fa_roe_o10,fa_pe_u50,fa_epsyoy1_o15,geo_usa&ft=4',
    criteria: {
      marketCapMin: 300e6,
      marketCapMax: 10e9,
      roeMin: 10,
      peMax: 50,
      epsGrowthMin: 15,
      country: 'USA',
    },
  },
};

function getPreset(name) {
  return PRESETS[name] || null;
}

function listPresets() {
  return Object.values(PRESETS);
}

module.exports = { getPreset, listPresets };
