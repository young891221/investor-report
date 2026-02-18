const { pickRaw } = require('./sources');

const NAV_SECTIONS = [
  { id: 'summary', label: '핵심요약' },
  { id: 'business', label: '비즈니스' },
  { id: 'finance', label: '재무' },
  { id: 'catalyst', label: '촉매' },
  { id: 'competitors', label: '경쟁사' },
  { id: 'risks', label: '리스크' },
  { id: 'verdict', label: '투자결론' },
];

const NAME_KR_OVERRIDES = {
  IREN: '아이렌 리미티드',
  RKLB: '로켓 랩',
};

const PEER_MAP = {
  RKLB: ['ASTS', 'PL', 'LUNR', 'RDW'],
  IREN: ['CORZ', 'CIFR', 'WULF', 'RIOT'],
};

const SECTOR_BENCHMARKS = [
  { pattern: /우주|aerospace|defense/iu, values: [35, 8, 4, 20] },
  { pattern: /반도체|semiconductor/iu, values: [28, 7, 6, 18] },
  { pattern: /software|saas|클라우드|cloud/iu, values: [30, 10, 6, 22] },
  { pattern: /금융|financial|bank/iu, values: [13, 3, 1.2, 9] },
  { pattern: /에너지|energy|oil|gas/iu, values: [14, 1.6, 1.7, 6] },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function formatDateDots(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function unixToLabel(unixSeconds, annual = false) {
  if (!Number.isFinite(unixSeconds)) {
    return null;
  }

  const date = new Date(unixSeconds * 1000);
  const year = date.getUTCFullYear();
  if (annual) {
    return `FY${year}`;
  }

  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  const yearShort = String(year).slice(-2);
  return `Q${quarter}'${yearShort}`;
}

function firstSentence(text) {
  const raw = String(text || '').replace(/\s+/gu, ' ').trim();
  if (!raw) {
    return '';
  }

  const parts = raw.split(/(?<=[.!?])\s+/u);
  return (parts[0] || raw).trim();
}

function formatPrice(value) {
  if (!Number.isFinite(value)) {
    return '-';
  }
  return `$${round(value, 2).toFixed(2)}`;
}

function formatCompactDollar(value) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  const abs = Math.abs(value);
  if (abs >= 1e12) {
    return `$${round(value / 1e12, 1)}T`;
  }
  if (abs >= 1e9) {
    return `$${round(value / 1e9, 1)}B`;
  }
  if (abs >= 1e6) {
    return `$${round(value / 1e6, 1)}M`;
  }
  if (abs >= 1e3) {
    return `$${round(value / 1e3, 1)}K`;
  }

  return `$${round(value, 0)}`;
}

function formatMillions(value) {
  if (!Number.isFinite(value)) {
    return '-';
  }
  return `$${round(value / 1e6, 1)}M`;
}

function formatBillions(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return round(value / 1e9, 1);
}

function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  const sign = value > 0 ? '+' : '';
  return `${sign}${round(value, digits)}%`;
}

function formatDeltaTag(value, digits = 0) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  const symbol = value >= 0 ? '▲' : '▼';
  return `${symbol} ${Math.abs(round(value, digits))}%`;
}

function normalizeExchange(exchange) {
  const raw = String(exchange || '').toUpperCase();
  if (raw.includes('NASDAQ') || raw.includes('NMS')) {
    return 'NASDAQ';
  }
  if (raw.includes('NYSE') || raw.includes('NYQ')) {
    return 'NYSE';
  }
  if (raw.includes('AMEX') || raw.includes('ASE')) {
    return 'AMEX';
  }
  return raw || 'US';
}

function mapRecommendation(value) {
  const key = String(value || '').toLowerCase();
  if (['strong_buy', 'buy', 'outperform'].includes(key)) {
    return 'Buy';
  }
  if (['hold', 'neutral'].includes(key)) {
    return 'Hold';
  }
  if (['underperform', 'sell', 'strong_sell'].includes(key)) {
    return 'Sell';
  }
  return 'Hold';
}

function toStatementRows(section, itemKey) {
  const list = section && Array.isArray(section[itemKey]) ? section[itemKey] : [];
  return list
    .map(item => {
      const endDate = pickRaw(item && item.endDate);
      const totalRevenue = pickRaw(item && item.totalRevenue);
      const netIncome = pickRaw(item && item.netIncome);
      const grossProfit = pickRaw(item && item.grossProfit);
      const operatingIncome = pickRaw(item && item.operatingIncome);
      const ebitda = pickRaw(item && item.ebitda);

      return {
        endDate,
        totalRevenue,
        netIncome,
        grossProfit,
        operatingIncome,
        ebitda,
      };
    })
    .filter(row => Number.isFinite(row.endDate))
    .sort((a, b) => a.endDate - b.endDate);
}

function toQuarterlySeries(summary) {
  const section = summary && summary.incomeStatementHistoryQuarterly;
  return toStatementRows(section, 'incomeStatementHistory')
    .filter(row => Number.isFinite(row.totalRevenue));
}

function toAnnualSeries(summary) {
  const section = summary && summary.incomeStatementHistory;
  return toStatementRows(section, 'incomeStatementHistory')
    .filter(row => Number.isFinite(row.totalRevenue));
}

function defaultSector(exchange, profile) {
  const sector = String(profile && profile.sector ? profile.sector : '').trim();
  const industry = String(profile && profile.industry ? profile.industry : '').trim();
  if (sector && industry) {
    return `${sector} / ${industry}`;
  }
  if (sector) {
    return sector;
  }
  if (industry) {
    return industry;
  }
  return `${exchange} 상장주`;
}

function getIndustryBenchmarks(sectorText, companyValues) {
  const matched = SECTOR_BENCHMARKS.find(item => item.pattern.test(String(sectorText || '')));
  if (!matched) {
    return companyValues.map(value => {
      if (!Number.isFinite(value) || value === 0) {
        return 1;
      }
      return round(Math.max(1, value * 0.6), 1);
    });
  }

  return matched.values.slice(0, companyValues.length).map(value => round(value, 1));
}

function scoreGrowth(yoyRevenue) {
  if (!Number.isFinite(yoyRevenue)) {
    return 5;
  }
  return clamp(Math.round((yoyRevenue + 10) / 6), 1, 10);
}

function scoreProfitability(netMargin) {
  if (!Number.isFinite(netMargin)) {
    return 4;
  }
  return clamp(Math.round((netMargin + 20) / 4), 1, 10);
}

function scoreFinancialHealth(netCash, currentRatio) {
  const cashScore = Number.isFinite(netCash) ? (netCash > 0 ? 7 : 4) : 5;
  const ratioScore = Number.isFinite(currentRatio) ? clamp(Math.round(currentRatio * 2), 2, 10) : 5;
  return clamp(Math.round((cashScore + ratioScore) / 2), 1, 10);
}

function scoreValuation(psRatio) {
  if (!Number.isFinite(psRatio) || psRatio <= 0) {
    return 5;
  }
  return clamp(Math.round(12 - psRatio / 2), 1, 10);
}

function scoreMoat(marketCap) {
  if (!Number.isFinite(marketCap)) {
    return 5;
  }

  if (marketCap >= 1e11) return 9;
  if (marketCap >= 3e10) return 8;
  if (marketCap >= 1e10) return 7;
  if (marketCap >= 3e9) return 6;
  return 5;
}

function scoreCatalyst(upsidePct) {
  if (!Number.isFinite(upsidePct)) {
    return 6;
  }
  return clamp(Math.round((upsidePct + 30) / 7), 1, 10);
}

function scoreReport(radarScores) {
  const weights = [0.24, 0.19, 0.16, 0.17, 0.12, 0.12];
  if (!Array.isArray(radarScores) || radarScores.length === 0) {
    return 50;
  }

  let weightedTotal = 0;
  let totalWeight = 0;

  radarScores.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      return;
    }

    const weight = Number.isFinite(weights[index]) ? weights[index] : 0;
    if (weight <= 0) {
      return;
    }

    weightedTotal += clamp(value, 1, 10) * weight;
    totalWeight += weight;
  });

  if (totalWeight === 0) {
    return 50;
  }

  return clamp(Math.round((weightedTotal / totalWeight) * 10), 0, 100);
}

function toReportVerdict(score) {
  if (!Number.isFinite(score)) {
    return 'HOLD';
  }
  if (score >= 80) {
    return 'STRONG BUY';
  }
  if (score >= 65) {
    return 'BUY';
  }
  if (score >= 50) {
    return 'HOLD';
  }
  if (score >= 35) {
    return 'REDUCE';
  }
  return 'SELL';
}

function tagColorByValue(value) {
  if (!Number.isFinite(value)) {
    return 'orange';
  }

  if (value > 0) {
    return 'green';
  }

  if (value < 0) {
    return 'red';
  }

  return 'blue';
}

function toTimelineDate(unixSeconds) {
  if (!Number.isFinite(unixSeconds)) {
    return null;
  }

  const date = new Date(unixSeconds * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function compactLabel(value) {
  const text = String(value || '').trim();
  if (!text) {
    return 'N/A';
  }

  if (text.length <= 12) {
    return text;
  }

  const firstBreak = text.indexOf(' ');
  if (firstBreak > 0 && firstBreak < text.length - 1) {
    return `${text.slice(0, firstBreak)}\n${text.slice(firstBreak + 1, firstBreak + 11)}`;
  }

  return `${text.slice(0, 10)}\n${text.slice(10, 20)}`;
}

function formatThreatTag(level) {
  if (level === 'high') {
    return "<span class='tag tag-red'>높음</span>";
  }
  if (level === 'medium') {
    return "<span class='tag tag-orange'>중간</span>";
  }
  return "<span class='tag tag-green'>낮음</span>";
}

function widthFromValue(value, maxValue, fallback = 20) {
  if (!Number.isFinite(value) || !Number.isFinite(maxValue) || maxValue <= 0) {
    return `${fallback}%`;
  }

  return `${clamp(Math.round((Math.abs(value) / maxValue) * 100), 8, 92)}%`;
}

function choosePeers(ticker, sectorText) {
  const upper = String(ticker || '').toUpperCase();
  if (Array.isArray(PEER_MAP[upper])) {
    return PEER_MAP[upper];
  }

  const text = String(sectorText || '').toLowerCase();
  if (text.includes('aerospace') || text.includes('우주')) {
    return ['LMT', 'NOC', 'RTX', 'LUNR'];
  }
  if (text.includes('semiconductor') || text.includes('반도체')) {
    return ['NVDA', 'AMD', 'AVGO', 'TSM'];
  }
  if (text.includes('cloud') || text.includes('software')) {
    return ['MSFT', 'AMZN', 'CRM', 'ORCL'];
  }
  if (text.includes('financial') || text.includes('금융')) {
    return ['JPM', 'BAC', 'WFC', 'GS'];
  }

  return ['SPY', 'QQQ', 'DIA', 'IWM'];
}

function numberOrFallback(value, fallback, placeholders, field, reason) {
  if (Number.isFinite(value)) {
    return value;
  }

  placeholders.push({ field, reason });
  return fallback;
}

function textOrFallback(value, fallback, placeholders, field, reason) {
  const text = String(value || '').trim();
  if (text) {
    return text;
  }

  placeholders.push({ field, reason });
  return fallback;
}

function buildStockJson(input) {
  const {
    ticker,
    secEntry,
    quote,
    summary,
    peerQuotes,
    options,
  } = input;

  const placeholders = [];
  const now = new Date();
  const analysisDate = formatDateDots(now);

  const assetProfile = summary && summary.assetProfile ? summary.assetProfile : {};
  const financialData = summary && summary.financialData ? summary.financialData : {};
  const defaultKeyStatistics = summary && summary.defaultKeyStatistics ? summary.defaultKeyStatistics : {};
  const calendarEvents = summary && summary.calendarEvents ? summary.calendarEvents : {};

  const companyNameEn = textOrFallback(
    secEntry && secEntry.companyNameEn,
    quote && (quote.longName || quote.shortName) ? quote.longName || quote.shortName : ticker,
    placeholders,
    'companyNameEn',
    'SEC company name is unavailable'
  );

  const companyName = NAME_KR_OVERRIDES[ticker] || companyNameEn;
  const exchange = normalizeExchange(quote && quote.exchange);
  const sector = defaultSector(exchange, assetProfile);

  const description = textOrFallback(
    firstSentence(assetProfile.longBusinessSummary),
    `${companyNameEn}의 공개 정보를 기반으로 자동 생성된 장기 투자 분석 초안입니다.`,
    placeholders,
    'description',
    'No business summary found from primary profile source'
  );

  const price = asNumber(quote && quote.regularMarketPrice);
  const high52 = asNumber(quote && quote.fiftyTwoWeekHigh);
  const low52 = asNumber(quote && quote.fiftyTwoWeekLow);
  const marketCap = asNumber(quote && quote.marketCap);
  const beta = asNumber(quote && quote.beta) || asNumber(pickRaw(defaultKeyStatistics.beta));

  const fromHighPct = Number.isFinite(price) && Number.isFinite(high52) && high52 !== 0
    ? ((price - high52) / high52) * 100
    : null;
  const fromLowPct = Number.isFinite(price) && Number.isFinite(low52) && low52 !== 0
    ? ((price - low52) / low52) * 100
    : null;

  const targetMean = asNumber(pickRaw(financialData.targetMeanPrice));
  const targetUpside = Number.isFinite(targetMean) && Number.isFinite(price) && price !== 0
    ? ((targetMean - price) / price) * 100
    : null;

  const quarterlySeries = toQuarterlySeries(summary);
  const annualSeries = toAnnualSeries(summary);

  const latestQuarter = quarterlySeries.length > 0 ? quarterlySeries[quarterlySeries.length - 1] : null;
  const priorYearQuarter = quarterlySeries.length > 4 ? quarterlySeries[quarterlySeries.length - 5] : null;

  const latestQuarterRevenue = asNumber(latestQuarter && latestQuarter.totalRevenue);
  const priorYearQuarterRevenue = asNumber(priorYearQuarter && priorYearQuarter.totalRevenue);

  const quarterlyRevenueYoY = Number.isFinite(latestQuarterRevenue) && Number.isFinite(priorYearQuarterRevenue) && priorYearQuarterRevenue !== 0
    ? ((latestQuarterRevenue - priorYearQuarterRevenue) / priorYearQuarterRevenue) * 100
    : null;

  const latestQuarterNetIncome = asNumber(latestQuarter && latestQuarter.netIncome);
  const latestQuarterMargin = Number.isFinite(latestQuarterRevenue) && latestQuarterRevenue !== 0 && Number.isFinite(latestQuarterNetIncome)
    ? (latestQuarterNetIncome / latestQuarterRevenue) * 100
    : null;

  const grossMargins = asNumber(pickRaw(financialData.grossMargins));
  const totalCash = asNumber(pickRaw(financialData.totalCash));
  const totalDebt = asNumber(pickRaw(financialData.totalDebt));
  const netCash = Number.isFinite(totalCash) && Number.isFinite(totalDebt) ? totalCash - totalDebt : null;

  const debtToEquityRaw = asNumber(pickRaw(financialData.debtToEquity));
  const debtToEquity = Number.isFinite(debtToEquityRaw)
    ? (debtToEquityRaw > 10 ? debtToEquityRaw / 100 : debtToEquityRaw)
    : null;

  const currentRatio = asNumber(pickRaw(financialData.currentRatio));
  const freeCashflow = asNumber(pickRaw(financialData.freeCashflow));
  const recommendation = mapRecommendation(financialData.recommendationKey);

  const annualLabels = [];
  const annualData = [];
  annualSeries.slice(-4).forEach(row => {
    const label = unixToLabel(row.endDate, true);
    if (label && Number.isFinite(row.totalRevenue)) {
      annualLabels.push(label);
      annualData.push(round(row.totalRevenue / 1e6, 1));
    }
  });

  if (annualData.length === 0 && Number.isFinite(latestQuarterRevenue)) {
    placeholders.push({ field: 'annualRevenue', reason: 'No annual income statement; fallback from latest quarter' });
    annualLabels.push(`FY${now.getFullYear()}`);
    annualData.push(round((latestQuarterRevenue * 4) / 1e6, 1));
  }

  let projectedGrowthPct = asNumber(pickRaw(financialData.revenueGrowth));
  if (!Number.isFinite(projectedGrowthPct) && annualData.length >= 2) {
    const last = annualData[annualData.length - 1];
    const prev = annualData[annualData.length - 2];
    if (prev > 0) {
      projectedGrowthPct = (last - prev) / prev;
    }
  }

  if (!Number.isFinite(projectedGrowthPct)) {
    projectedGrowthPct = 0.12;
    placeholders.push({ field: 'annualRevenue.projection', reason: 'Revenue growth estimate was missing, used default +12%' });
  }

  const lastAnnual = annualData[annualData.length - 1];
  const estimateYear = annualLabels.length > 0
    ? Number(String(annualLabels[annualLabels.length - 1]).replace('FY', '')) + 1
    : now.getFullYear() + 1;
  annualLabels.push(`FY${estimateYear}E`);
  annualData.push(round(lastAnnual * (1 + projectedGrowthPct), 1));
  const estimateStartIndex = annualData.length - 1;

  const quarterLabels = [];
  const quarterData = [];
  quarterlySeries.slice(-6).forEach(row => {
    const label = unixToLabel(row.endDate, false);
    if (label && Number.isFinite(row.totalRevenue)) {
      quarterLabels.push(label);
      quarterData.push(round(row.totalRevenue / 1e6, 1));
    }
  });

  if (quarterData.length < 4 && annualData.length > 0) {
    placeholders.push({ field: 'quarterlyRevenue', reason: 'Quarterly income statement missing, generated from annual run-rate' });
    const runRate = (annualData[annualData.length - 2 >= 0 ? annualData.length - 2 : 0] * 1e6) / 4;
    while (quarterData.length < 4) {
      const qIndex = quarterData.length + 1;
      const label = `Q${qIndex}'${String(now.getFullYear()).slice(-2)}`;
      quarterLabels.push(label);
      quarterData.push(round((runRate * (1 + qIndex * 0.03)) / 1e6, 1));
    }
  }

  const marginLabels = [];
  const marginGaap = [];
  const marginNonGaap = [];

  annualSeries.slice(-4).forEach(row => {
    const label = unixToLabel(row.endDate, true);
    if (!label || !Number.isFinite(row.totalRevenue) || row.totalRevenue === 0) {
      return;
    }

    marginLabels.push(label);
    const margin = Number.isFinite(row.netIncome) ? (row.netIncome / row.totalRevenue) * 100 : null;
    marginGaap.push(Number.isFinite(margin) ? round(margin, 1) : null);
    marginNonGaap.push(null);
  });

  if (latestQuarter && Number.isFinite(latestQuarterRevenue) && latestQuarterRevenue !== 0) {
    marginLabels.push(unixToLabel(latestQuarter.endDate, false));
    marginGaap.push(Number.isFinite(latestQuarterMargin) ? round(latestQuarterMargin, 1) : null);
    const grossMarginPct = Number.isFinite(grossMargins) ? grossMargins * 100 : null;
    marginNonGaap.push(Number.isFinite(grossMarginPct) ? round(grossMarginPct, 1) : null);
  }

  if (marginLabels.length === 0) {
    placeholders.push({ field: 'marginTrend', reason: 'No margin history available' });
    marginLabels.push(`FY${now.getFullYear() - 1}`, `FY${now.getFullYear()}`);
    marginGaap.push(-10, -5);
    marginNonGaap.push(null, null);
  }

  const keyPoints = [
    `📈 <strong>최근 성장 추이:</strong> 최근 분기 매출 ${formatMillions(latestQuarterRevenue)}${
      Number.isFinite(quarterlyRevenueYoY) ? `, YoY ${formatPercent(quarterlyRevenueYoY, 1)}` : ''
    }`,
    `🧾 <strong>수익성 상태:</strong> 최근 분기 순이익률 ${
      Number.isFinite(latestQuarterMargin) ? `${round(latestQuarterMargin, 1)}%` : '데이터 확인 필요'
    }`,
    `💵 <strong>재무 체력:</strong> 현금 ${formatCompactDollar(totalCash)}, 부채 ${formatCompactDollar(totalDebt)}, 순현금 ${formatCompactDollar(netCash)}`,
    `🎯 <strong>시장 기대치:</strong> 애널리스트 평균 목표가 ${Number.isFinite(targetMean) ? formatPrice(targetMean) : 'N/A'}${
      Number.isFinite(targetUpside) ? ` (${targetUpside >= 0 ? '↑' : '↓'}${Math.abs(round(targetUpside, 1))}%)` : ''
    }`,
    `⚠️ <strong>변동성 체크:</strong> 베타 ${Number.isFinite(beta) ? round(beta, 2) : 'N/A'}${
      Number.isFinite(beta) && beta > 1.8 ? '로 고변동 구간' : ''
    }`,
  ];

  const segmentPrimaryTitle = textOrFallback(
    String(assetProfile.industry || '').trim(),
    '핵심 사업군',
    placeholders,
    'segments[0].name',
    'Industry label missing'
  );

  const revenuePrimary = quarterData.length > 0 ? quarterData[quarterData.length - 1] : annualData[annualData.length - 1] / 4;

  const segments = [
    {
      name: segmentPrimaryTitle,
      icon: '🏢',
      color: 'accent',
      backlog: '핵심',
      description: '공시된 사업 설명을 기준으로 핵심 매출이 발생하는 영역입니다. 분기 실적과 수주 흐름을 함께 점검해야 합니다.',
      revenue: `최근 분기 매출: ${formatMillions(revenuePrimary * 1e6)}`,
    },
    {
      name: '성장 동력 사업',
      icon: '🚀',
      color: 'orange',
      backlog: '확장',
      description: '신규 제품/고객/지역 확장을 통해 중장기 성장을 만드는 사업 축입니다. 가이던스와 실행 일정을 우선 모니터링합니다.',
      revenue: Number.isFinite(quarterlyRevenueYoY)
        ? `매출 성장률: YoY ${formatPercent(quarterlyRevenueYoY, 1)}`
        : '매출 성장률: 데이터 확인 필요',
    },
    {
      name: '재무·실행 관리',
      icon: '🛠️',
      color: 'purple',
      backlog: '관리',
      description: '현금흐름, 투자 집행, 비용 구조를 통해 장기 수익성 전환 속도를 결정하는 영역입니다.',
      revenue: `FCF: ${formatCompactDollar(freeCashflow)}`,
    },
  ];

  const revenueBreakdown = {
    labels: ['총매출'],
    data: [100],
    colors: ['#3b82f6'],
  };

  const latestAnnualRevenue = annualData[annualData.length - 1] * 1e6;
  const priorAnnualRevenue = annualData.length > 2 ? annualData[annualData.length - 2] * 1e6 : null;
  const annualGrowthPct = Number.isFinite(latestAnnualRevenue) && Number.isFinite(priorAnnualRevenue) && priorAnnualRevenue > 0
    ? ((latestAnnualRevenue - priorAnnualRevenue) / priorAnnualRevenue) * 100
    : null;

  const epsRaw = asNumber(pickRaw(financialData.epsCurrentYear));
  const currentPrice = asNumber(pickRaw(financialData.currentPrice)) || price;

  const financialTable = [
    [
      '매출',
      formatMillions(latestQuarterRevenue),
      formatMillions(priorYearQuarterRevenue),
      Number.isFinite(quarterlyRevenueYoY) ? `${formatPercent(quarterlyRevenueYoY, 1)} YoY` : 'N/A',
      tagColorByValue(quarterlyRevenueYoY),
      '최근 분기 실적 기준 자동 계산 값',
    ],
    [
      '연간 매출(최근)',
      formatCompactDollar(latestAnnualRevenue),
      formatCompactDollar(priorAnnualRevenue),
      Number.isFinite(annualGrowthPct) ? formatPercent(annualGrowthPct, 1) : 'N/A',
      tagColorByValue(annualGrowthPct),
      '연간 손익계산서 기반',
    ],
    [
      '순이익률',
      Number.isFinite(latestQuarterMargin) ? `${round(latestQuarterMargin, 1)}%` : '-',
      '-',
      Number.isFinite(latestQuarterMargin) ? (latestQuarterMargin >= 0 ? '흑자' : '적자') : 'N/A',
      tagColorByValue(latestQuarterMargin),
      '최근 분기 순이익/매출 기준',
    ],
    [
      'EPS (FY)',
      Number.isFinite(epsRaw) ? `$${round(epsRaw, 2)}` : '-',
      '-',
      '참고',
      'blue',
      '연간 EPS 데이터',
    ],
    [
      '현금',
      formatCompactDollar(totalCash),
      '-',
      Number.isFinite(totalCash) ? '유동성 보유' : '확인 필요',
      'green',
      '재무 데이터 기준',
    ],
    [
      '총 부채',
      formatCompactDollar(totalDebt),
      '-',
      Number.isFinite(totalDebt) ? '레버리지 모니터링' : '확인 필요',
      Number.isFinite(totalDebt) && totalDebt > (totalCash || 0) ? 'orange' : 'blue',
      '재무 데이터 기준',
    ],
    [
      '시가총액',
      formatCompactDollar(marketCap),
      '-',
      Number.isFinite(marketCap) ? '시장 평가' : '확인 필요',
      'blue',
      '실시간 시세 기준',
    ],
    [
      '주가',
      formatPrice(currentPrice),
      '-',
      Number.isFinite(fromHighPct) ? `${fromHighPct <= 0 ? 'ATH 대비 하락' : '52주 고점 돌파'} ${Math.abs(round(fromHighPct, 1))}%` : 'N/A',
      Number.isFinite(fromHighPct) && fromHighPct > 0 ? 'green' : 'orange',
      '52주 고가 비교',
    ],
  ];

  const companyValuation = [
    numberOrFallback(asNumber(quote && quote.trailingPE), 0, placeholders, 'valuation.trailingPE', 'Trailing P/E unavailable'),
    numberOrFallback(asNumber(quote && quote.priceToSalesTrailing12Months), 0, placeholders, 'valuation.priceToSales', 'P/S unavailable'),
    numberOrFallback(asNumber(quote && quote.priceToBook), 0, placeholders, 'valuation.priceToBook', 'P/B unavailable'),
    numberOrFallback(asNumber(quote && quote.enterpriseToEbitda), 0, placeholders, 'valuation.evToEbitda', 'EV/EBITDA unavailable'),
  ].map(value => round(value, 1));

  const industryValuation = getIndustryBenchmarks(sector, companyValuation);

  const healthMax = Math.max(totalCash || 0, totalDebt || 0, Math.abs(netCash || 0), 1);

  const financialHealth = [
    {
      label: '현금 및 현금성 자산',
      value: formatCompactDollar(totalCash),
      width: widthFromValue(totalCash, healthMax, 30),
      gradient: 'var(--green),var(--green2)',
    },
    {
      label: '총 부채',
      value: formatCompactDollar(totalDebt),
      width: widthFromValue(totalDebt, healthMax, 30),
      gradient: 'var(--red),var(--red2)',
    },
    {
      label: '순현금(부채)',
      value: formatCompactDollar(netCash),
      width: widthFromValue(netCash, healthMax, 30),
      gradient: 'var(--accent),var(--accent2)',
    },
  ];

  const healthMetrics = [
    {
      label: 'D/E 비율',
      value: Number.isFinite(debtToEquity) ? `${round(debtToEquity, 2)} ${debtToEquity <= 1 ? '(양호)' : '(주의)'}` : 'N/A',
      color: Number.isFinite(debtToEquity) && debtToEquity <= 1 ? 'var(--green2)' : 'var(--orange)',
    },
    {
      label: '유동비율',
      value: Number.isFinite(currentRatio) ? `${round(currentRatio, 2)} ${currentRatio >= 1.5 ? '(양호)' : '(주의)'}` : 'N/A',
      color: Number.isFinite(currentRatio) && currentRatio >= 1.5 ? 'var(--green2)' : 'var(--orange)',
    },
    {
      label: '베타',
      value: Number.isFinite(beta) ? `${round(beta, 2)} ${beta > 1.8 ? '(고변동)' : '(보통)'}` : 'N/A',
      color: Number.isFinite(beta) && beta > 1.8 ? 'var(--orange)' : 'var(--green2)',
    },
    {
      label: '자유현금흐름',
      value: formatCompactDollar(freeCashflow),
      color: Number.isFinite(freeCashflow) && freeCashflow >= 0 ? 'var(--green2)' : 'var(--orange)',
    },
  ];

  const earningsDates = Array.isArray(calendarEvents.earnings && calendarEvents.earnings.earningsDate)
    ? calendarEvents.earnings.earningsDate
    : [];
  const nextEarningsRaw = earningsDates.length > 0 ? pickRaw(earningsDates[0]) : null;
  const nextEarningsDate = toTimelineDate(nextEarningsRaw);

  const latestQuarterDate = latestQuarter ? toTimelineDate(latestQuarter.endDate) : null;
  const latestAnnualDate = annualSeries.length > 0 ? toTimelineDate(annualSeries[annualSeries.length - 1].endDate) : null;

  const timeline = [
    {
      date: latestAnnualDate || `${now.getFullYear() - 1}.12.31`,
      text: '최근 연간 실적 기준 데이터 반영',
      status: 'done',
    },
    {
      date: latestQuarterDate || `${now.getFullYear()}.Q${Math.floor(now.getMonth() / 3) + 1}`,
      text: '최근 분기 실적 데이터 반영',
      status: 'done',
    },
    {
      date: analysisDate,
      text: '자동 리포트 생성 및 검증 완료',
      status: 'done',
    },
    {
      date: nextEarningsDate || `${now.getFullYear()}.${String(now.getMonth() + 2).padStart(2, '0')}`,
      text: '다음 실적 발표 확인',
      status: 'pending',
    },
    {
      date: `${now.getFullYear()}.H2`,
      text: '가이던스 업데이트 및 실행 지표 점검',
      status: 'pending',
    },
    {
      date: `${now.getFullYear() + 1}.상반기`,
      text: '중기 성장 로드맵 재점검',
      status: 'pending',
    },
  ];

  const peers = choosePeers(ticker, sector);
  const peerRows = peers
    .map(peerTicker => peerQuotes.find(item => item.symbol === peerTicker))
    .filter(Boolean)
    .slice(0, 4);

  const competitorLabels = [compactLabel(companyNameEn)];
  const competitorData = [formatBillions(marketCap) || 0.1];
  const competitorColors = ['#3b82f6'];

  const competitorTableRows = [
    [
      companyNameEn,
      ticker,
      String(assetProfile.industry || sector).trim() || '핵심 사업',
      formatCompactDollar(marketCap),
      '자동 생성 기준 종목',
      '—',
    ],
  ];

  peerRows.forEach((peer, index) => {
    competitorLabels.push(compactLabel(peer.longName || peer.shortName || peer.symbol));
    competitorData.push(formatBillions(peer.marketCap) || 0.1);
    competitorColors.push(['#ec4899', '#06b6d4', '#f59e0b', '#8b5cf6'][index % 4]);

    const threatLevel = Number.isFinite(peer.marketCap) && Number.isFinite(marketCap)
      ? (peer.marketCap >= marketCap ? 'high' : peer.marketCap >= marketCap * 0.5 ? 'medium' : 'low')
      : 'medium';

    competitorTableRows.push([
      peer.longName || peer.shortName || peer.symbol,
      peer.symbol,
      '동종 상장사',
      formatCompactDollar(peer.marketCap),
      '시장 비교 기준',
      formatThreatTag(threatLevel),
    ]);
  });

  if (competitorTableRows.length === 1) {
    placeholders.push({ field: 'competitors', reason: 'Peer quotes unavailable; table contains only self row' });
  }

  const risks = {
    items: [
      {
        label: '실적 변동성',
        x: clamp(Number.isFinite(beta) ? round(beta * 3, 1) : 6, 2, 9),
        y: 8,
        r: 20,
        bg: 'rgba(239,68,68,.55)',
        border: '#ef4444',
      },
      {
        label: '밸류에이션 조정',
        x: clamp(Number.isFinite(companyValuation[1]) ? round(companyValuation[1] / 8, 1) : 6, 2, 9),
        y: 7,
        r: 18,
        bg: 'rgba(245,158,11,.5)',
        border: '#f59e0b',
      },
      {
        label: '재무구조 변화',
        x: clamp(Number.isFinite(debtToEquity) ? round(debtToEquity * 4, 1) : 5, 2, 9),
        y: 6,
        r: 16,
        bg: 'rgba(139,92,246,.45)',
        border: '#8b5cf6',
      },
      {
        label: '가이던스 미스',
        x: 6,
        y: 8,
        r: 17,
        bg: 'rgba(6,182,212,.45)',
        border: '#06b6d4',
      },
      {
        label: '자본 조달/희석',
        x: 5,
        y: 6,
        r: 14,
        bg: 'rgba(236,72,153,.4)',
        border: '#ec4899',
      },
    ],
    warnings: [
      `📊 <strong>실적 민감도:</strong> 최근 분기 매출 ${formatMillions(latestQuarterRevenue)} 기준으로 분기 변동 시 주가 탄력도가 높아질 수 있습니다.`,
      `💹 <strong>밸류에이션 리스크:</strong> 현재 P/S ${companyValuation[1]}x 구간에서는 성장률 둔화 신호에 멀티플 조정이 동반될 수 있습니다.`,
      `🏦 <strong>재무 구조:</strong> 총부채 ${formatCompactDollar(totalDebt)}, 순현금(부채) ${formatCompactDollar(netCash)} 흐름을 분기별로 점검해야 합니다.`,
      `🧭 <strong>이벤트 리스크:</strong> 다음 실적 발표(${nextEarningsDate || '예정'})에서 가이던스 변동 여부가 단기 방향성에 중요합니다.`,
      '📝 <strong>자동 생성 한계:</strong> 세부 사업부/수주 내역은 최신 IR 원문으로 2차 검증이 필요합니다.',
    ],
  };

  const growthScore = scoreGrowth(quarterlyRevenueYoY);
  const profitScore = scoreProfitability(latestQuarterMargin);
  const moatScore = scoreMoat(marketCap);
  const healthScore = scoreFinancialHealth(netCash, currentRatio);
  const valuationScore = scoreValuation(companyValuation[1]);
  const catalystScore = scoreCatalyst(targetUpside);

  const radar = {
    labels: ['성장성', '수익성', '경쟁우위', '재무건전성', '밸류에이션\n매력도', '카탈리스트'],
    data: [growthScore, profitScore, moatScore, healthScore, valuationScore, catalystScore],
  };
  const reportScore = scoreReport(radar.data);
  const reportVerdict = toReportVerdict(reportScore);

  const bullCase = [
    '📌 <strong>매출 성장 유지:</strong> 최근 분기/연간 매출 추세가 유지되면 멀티플 프리미엄 방어 가능성',
    `💼 <strong>현금 버퍼:</strong> 보유 현금 ${formatCompactDollar(totalCash)} 수준은 투자 사이클 대응에 유리`,
    `🎯 <strong>컨센서스 여력:</strong> 목표가 대비 업사이드 ${Number.isFinite(targetUpside) ? `${round(targetUpside, 1)}%` : '데이터 확인 필요'} 구간`,
    '🧱 <strong>사업 포트폴리오:</strong> 핵심 사업 + 성장 사업의 병행 구조는 장기 스토리 유지에 유리',
    '🔄 <strong>정기 모니터링:</strong> 분기 실적의 누적 개선이 장기 투자 시그널로 작동',
  ];

  const bearCase = [
    '⚠️ <strong>고평가 조정:</strong> 성장 둔화 또는 가이던스 미스 시 밸류에이션 압축 리스크',
    '📉 <strong>실적 변동성:</strong> 분기 매출/마진 변동이 클 경우 주가 변동성이 확대될 수 있음',
    '💸 <strong>현금흐름 부담:</strong> FCF 적자 지속 시 추가 자본 조달 가능성 점검 필요',
    '🏛️ <strong>거시 환경:</strong> 금리/리스크오프 국면에서 성장주 할인율 상승 위험',
    '🧪 <strong>데이터 공백:</strong> 자동 생성된 정성 항목은 최신 IR 원문 검증 전제',
  ];

  const checklist = [
    ['다음 실적 발표', nextEarningsDate || `${now.getFullYear()}.Q${Math.floor(now.getMonth() / 3) + 2}`, '매출/가이던스/마진 변동 여부 확인'],
    ['매출 성장률', '분기별', `YoY ${Number.isFinite(quarterlyRevenueYoY) ? `${round(quarterlyRevenueYoY, 1)}%` : '추적 필요'} 유지 여부`],
    ['수익성 추세', '분기별', '순이익률 및 총마진 개선 경로 확인'],
    ['재무건전성', '분기별', '현금·부채·FCF 동시 점검'],
    ['밸류에이션', '상시', 'P/S·P/E 괴리 확대 시 비중 조절 검토'],
    ['경쟁사 비교', '분기별', '동종 상장사 대비 성장률/시총 변화 추적'],
  ];

  const moats = [
    {
      icon: '🧩',
      name: '핵심 사업 기반',
      desc: '주력 사업에서의 실행력 축적<br>분기 실적 일관성이 핵심 지표',
    },
    {
      icon: '📈',
      name: '성장 모멘텀',
      desc: '매출 성장과 가이던스 상향 여지<br>장기 멀티플 방어의 핵심',
    },
    {
      icon: '💵',
      name: '유동성 관리',
      desc: '현금 버퍼와 투자 집행 통제<br>하방 방어에 중요한 요인',
    },
    {
      icon: '🛡️',
      name: '리스크 관리 체계',
      desc: '밸류·실적·재무 지표 동시 점검<br>장기 투자 실행력 개선',
    },
  ];

  const output = {
    ticker,
    companyName,
    companyNameEn,
    exchange,
    sector,
    description,
    analysisDate,

    price: formatPrice(price),
    priceChange: Number.isFinite(fromHighPct)
      ? `${fromHighPct >= 0 ? '▲' : '▼'} ${Math.abs(round(fromHighPct, 1))}% from 52주고가`
      : '-',
    priceChangeDir: Number.isFinite(fromHighPct) && fromHighPct > 0 ? 'up' : 'down',
    marketCap: formatCompactDollar(marketCap),
    marketCapChange: Number.isFinite(fromLowPct) ? `${formatDeltaTag(fromLowPct, 0)} (52주)` : '-',
    weekRange: Number.isFinite(low52) && Number.isFinite(high52)
      ? `${formatPrice(low52)} — ${formatPrice(high52)}`
      : '-',
    analystRating: recommendation,
    analystTarget: Number.isFinite(targetMean)
      ? `목표 ${formatPrice(targetMean)}${
          Number.isFinite(targetUpside) ? ` (${targetUpside >= 0 ? '↑' : '↓'}${Math.abs(round(targetUpside, 1))}%)` : ''
        }`
      : '목표가 데이터 확인 필요',
    reportScore,
    reportVerdict,

    keyPoints,

    navSections: NAV_SECTIONS,

    segments,

    revenueBreakdown,

    annualRevenue: {
      labels: annualLabels,
      data: annualData,
      estimateStartIndex,
    },

    quarterlyRevenue: {
      labels: quarterLabels,
      data: quarterData,
    },

    marginTrend: {
      labels: marginLabels,
      gaap: marginGaap,
      nonGaap: marginNonGaap,
    },

    financialTable,

    valuation: {
      labels: ['P/E (TTM)', 'P/S (TTM)', 'P/B', 'EV/EBITDA'],
      company: companyValuation,
      industry: industryValuation,
    },

    financialHealth,
    healthMetrics,

    timeline,

    competitorChart: {
      labels: competitorLabels,
      data: competitorData,
      colors: competitorColors,
      chartLabel: `동종 비교 시가총액 (자동 생성, ${analysisDate})`,
      yLabel: 'B',
    },

    competitorTable: {
      headers: ['기업', '티커', '핵심 사업', '시가총액', '차별화', '위협 수준'],
      rows: competitorTableRows,
    },

    risks,

    radar,

    bullCase,
    bearCase,

    checklist,

    moats,
  };

  const criticalChecks = [];

  if (!output.ticker || output.ticker.length < 1) criticalChecks.push('ticker missing');
  if (!output.companyNameEn || output.companyNameEn.length < 1) criticalChecks.push('companyNameEn missing');
  if (output.price === '-') criticalChecks.push('price missing');
  if (output.marketCap === '-') criticalChecks.push('marketCap missing');
  if (output.weekRange === '-') criticalChecks.push('weekRange missing');
  if (!Array.isArray(output.annualRevenue.data) || output.annualRevenue.data.length < 2) {
    criticalChecks.push('annualRevenue.data needs at least 2 points');
  }
  if (!Array.isArray(output.quarterlyRevenue.data) || output.quarterlyRevenue.data.length < 4) {
    criticalChecks.push('quarterlyRevenue.data needs at least 4 points');
  }

  if (options.strict && criticalChecks.length > 0) {
    throw new Error(`Strict mode validation failed: ${criticalChecks.join(', ')}`);
  }

  if (!options.allowPlaceholders && placeholders.length > 0) {
    const fields = placeholders.map(item => item.field).join(', ');
    throw new Error(`Placeholders detected while --no-allow-placeholders is set: ${fields}`);
  }

  return {
    stock: output,
    metadata: {
      placeholders,
      criticalChecks,
      summary: {
        companyNameEn,
        sector,
        annualPoints: output.annualRevenue.data.length,
        quarterPoints: output.quarterlyRevenue.data.length,
      },
    },
  };
}

module.exports = {
  buildStockJson,
  choosePeers,
  formatDateDots,
};
