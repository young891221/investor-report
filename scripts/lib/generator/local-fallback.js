const fs = require('node:fs');
const path = require('node:path');

function toUpperTicker(value) {
  return String(value || '').trim().toUpperCase();
}

function parseCompactDollar(value) {
  const text = String(value || '').trim();
  if (!text || text === '-') {
    return null;
  }

  const normalized = text.replaceAll(',', '').replace(/\$/gu, '').trim();
  const match = normalized.match(/(-?\d+(?:\.\d+)?)(?:\s*)([TMBK]?)/iu);
  if (!match) {
    return null;
  }

  const base = Number(match[1]);
  if (!Number.isFinite(base)) {
    return null;
  }

  const unit = String(match[2] || '').toUpperCase();
  const multipliers = {
    T: 1e12,
    B: 1e9,
    M: 1e6,
    K: 1e3,
    '': 1,
  };

  return base * (multipliers[unit] || 1);
}

function parseFirstNumber(value) {
  const text = String(value || '').replaceAll(',', '');
  const match = text.match(/-?\d+(?:\.\d+)?/u);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercent(value) {
  const parsed = parseFirstNumber(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function parseWeekRange(value) {
  const text = String(value || '');
  const values = text.match(/\$?\s*[\d,.]+/gu) || [];
  if (values.length < 2) {
    return { low: null, high: null };
  }

  const low = parseFirstNumber(values[0]);
  const high = parseFirstNumber(values[1]);
  return { low, high };
}

function getValuationByLabel(stock, keyword) {
  const valuation = stock && stock.valuation && typeof stock.valuation === 'object' ? stock.valuation : null;
  if (!valuation || !Array.isArray(valuation.labels) || !Array.isArray(valuation.company)) {
    return null;
  }

  const idx = valuation.labels.findIndex(label => String(label || '').toLowerCase().includes(keyword.toLowerCase()));
  if (idx < 0) {
    return null;
  }

  const value = valuation.company[idx];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function findMetricValue(metrics, keyword) {
  if (!Array.isArray(metrics)) {
    return null;
  }

  const row = metrics.find(item => String(item && item.label || '').toLowerCase().includes(keyword.toLowerCase()));
  if (!row) {
    return null;
  }

  return parseFirstNumber(row.value);
}

function parseRecommendationKey(value) {
  const key = String(value || '').toLowerCase();
  if (key.includes('strong buy')) return 'strong_buy';
  if (key.includes('buy')) return 'buy';
  if (key.includes('hold') || key.includes('neutral')) return 'hold';
  if (key.includes('reduce') || key.includes('underperform')) return 'underperform';
  if (key.includes('sell')) return 'sell';
  return 'hold';
}

function wrapRaw(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return { raw: value };
}

function parseYearFromLabel(label, fallbackYear) {
  const text = String(label || '');
  const year4 = text.match(/(20\d{2})/u);
  if (year4) {
    return Number(year4[1]);
  }

  const year2 = text.match(/'(\d{2})/u) || text.match(/\b(\d{2})\b/u);
  if (year2) {
    return 2000 + Number(year2[1]);
  }

  return fallbackYear;
}

function annualLabelToUnix(label, fallbackYear) {
  const year = parseYearFromLabel(label, fallbackYear);
  return Math.floor(Date.UTC(year, 11, 31) / 1000);
}

function quarterlyLabelToUnix(label, fallbackYear, fallbackQuarter) {
  const text = String(label || '');
  const match = text.match(/Q([1-4])(?:['\s]?(\d{2,4}))?/iu);
  let quarter = fallbackQuarter;
  let year = fallbackYear;

  if (match) {
    quarter = Number(match[1]);
    if (match[2]) {
      const parsedYear = Number(match[2]);
      year = parsedYear < 100 ? 2000 + parsedYear : parsedYear;
    }
  }

  const endMonth = quarter * 3;
  return Math.floor(Date.UTC(year, endMonth, 0) / 1000);
}

function buildAnnualIncomeRows(stock) {
  const annualRevenue = stock && stock.annualRevenue && typeof stock.annualRevenue === 'object' ? stock.annualRevenue : null;
  const labels = annualRevenue && Array.isArray(annualRevenue.labels) ? annualRevenue.labels : [];
  const data = annualRevenue && Array.isArray(annualRevenue.data) ? annualRevenue.data : [];
  const currentYear = new Date().getUTCFullYear();

  return data
    .map((value, index) => {
      const revenueInMillions = typeof value === 'number' && Number.isFinite(value) ? value : null;
      if (!Number.isFinite(revenueInMillions)) {
        return null;
      }
      const label = labels[index];
      const fallbackYear = currentYear - Math.max(0, data.length - index - 1);
      return {
        endDate: annualLabelToUnix(label, fallbackYear),
        totalRevenue: revenueInMillions * 1e6,
        netIncome: null,
        grossProfit: null,
        operatingIncome: null,
        ebitda: null,
      };
    })
    .filter(Boolean);
}

function buildQuarterlyIncomeRows(stock) {
  const quarterlyRevenue = stock && stock.quarterlyRevenue && typeof stock.quarterlyRevenue === 'object' ? stock.quarterlyRevenue : null;
  const labels = quarterlyRevenue && Array.isArray(quarterlyRevenue.labels) ? quarterlyRevenue.labels : [];
  const data = quarterlyRevenue && Array.isArray(quarterlyRevenue.data) ? quarterlyRevenue.data : [];
  const currentYear = new Date().getUTCFullYear();

  return data
    .map((value, index) => {
      const revenueInMillions = typeof value === 'number' && Number.isFinite(value) ? value : null;
      if (!Number.isFinite(revenueInMillions)) {
        return null;
      }
      const label = labels[index];
      const fallbackYear = currentYear;
      const fallbackQuarter = ((index % 4) + 1);
      return {
        endDate: quarterlyLabelToUnix(label, fallbackYear, fallbackQuarter),
        totalRevenue: revenueInMillions * 1e6,
        netIncome: null,
        grossProfit: null,
        operatingIncome: null,
        ebitda: null,
      };
    })
    .filter(Boolean);
}

function parseEarningsDateFromChecklist(stock) {
  const checklist = Array.isArray(stock && stock.checklist) ? stock.checklist : [];
  const first = checklist.find(row => Array.isArray(row) && row.length >= 2);
  if (!first) {
    return null;
  }

  const dateText = String(first[1] || '');
  const match = dateText.match(/(20\d{2})\.(\d{1,2})(?:\.(\d{1,2}))?/u);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3] || 1);
  return Math.floor(Date.UTC(year, month - 1, day) / 1000);
}

function parseTargetPrice(stock) {
  return parseFirstNumber(String(stock && stock.analystTarget || ''));
}

function parseCashFromFinancialHealth(stock) {
  const rows = Array.isArray(stock && stock.financialHealth) ? stock.financialHealth : [];

  const cashRow = rows.find(item => /현금/iu.test(String(item && item.label || '')));
  const debtRow = rows.find(item => /부채/iu.test(String(item && item.label || '')));

  return {
    totalCash: cashRow ? parseCompactDollar(cashRow.value) : null,
    totalDebt: debtRow ? parseCompactDollar(debtRow.value) : null,
  };
}

function parseGrowthFromAnnualRevenue(stock) {
  const annualRevenue = stock && stock.annualRevenue && typeof stock.annualRevenue === 'object' ? stock.annualRevenue : null;
  const data = annualRevenue && Array.isArray(annualRevenue.data) ? annualRevenue.data : [];
  if (data.length < 2) {
    return null;
  }

  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  if (!Number.isFinite(last) || !Number.isFinite(prev) || prev === 0) {
    return null;
  }

  return (last - prev) / prev;
}

function buildQuoteFromSnapshot(stock, ticker) {
  const weekRange = parseWeekRange(stock.weekRange);
  const beta = findMetricValue(stock.healthMetrics, '베타');
  const forwardPEFromPegInputs = stock && stock.pegInputs && Number.isFinite(stock.pegInputs.forwardPE)
    ? stock.pegInputs.forwardPE
    : null;

  return {
    symbol: toUpperTicker(ticker || stock.ticker),
    shortName: String(stock.companyNameEn || stock.companyName || ticker || '').trim(),
    longName: String(stock.companyNameEn || stock.companyName || ticker || '').trim(),
    exchange: String(stock.exchange || '').trim(),
    quoteType: 'EQUITY',
    currency: 'USD',
    marketCap: parseCompactDollar(stock.marketCap),
    regularMarketPrice: parseCompactDollar(stock.price),
    fiftyTwoWeekLow: weekRange.low,
    fiftyTwoWeekHigh: weekRange.high,
    trailingPE: getValuationByLabel(stock, 'p/e'),
    forwardPE: forwardPEFromPegInputs || getValuationByLabel(stock, 'forward p/e'),
    priceToSalesTrailing12Months: getValuationByLabel(stock, 'p/s'),
    priceToBook: getValuationByLabel(stock, 'p/b'),
    enterpriseToEbitda: getValuationByLabel(stock, 'ev/ebitda'),
    beta,
  };
}

function buildSummaryFromSnapshot(stock) {
  const annualRows = buildAnnualIncomeRows(stock);
  const quarterlyRows = buildQuarterlyIncomeRows(stock);
  const roePct = findMetricValue(stock.healthMetrics, 'ROE');
  const peg = findMetricValue(stock.healthMetrics, 'PEG');
  const deRatio = findMetricValue(stock.healthMetrics, 'D/E');
  const currentRatio = findMetricValue(stock.healthMetrics, '유동비율');
  const freeCashflow = findMetricValue(stock.healthMetrics, 'FCF');
  const beta = findMetricValue(stock.healthMetrics, '베타');
  const targetPrice = parseTargetPrice(stock);
  const grossMarginPct = parsePercent(
    String(
      (Array.isArray(stock.financialTable)
        ? (stock.financialTable.find(row => Array.isArray(row) && /총이익률|GAAP 총마진/iu.test(String(row[0] || ''))) || [])[1]
        : '')
    )
  );
  const epsCurrentYear = parseFirstNumber(
    String(
      (Array.isArray(stock.financialTable)
        ? (stock.financialTable.find(row => Array.isArray(row) && /EPS/iu.test(String(row[0] || ''))) || [])[1]
        : '')
    )
  );
  const { totalCash, totalDebt } = parseCashFromFinancialHealth(stock);
  const revenueGrowth = parseGrowthFromAnnualRevenue(stock);
  const earningsDate = parseEarningsDateFromChecklist(stock);
  const sector = String(stock.sector || '').split('/')[0].trim() || 'Technology';
  const industry = String(stock.sector || '').split('/')[1]
    ? String(stock.sector || '').split('/')[1].trim()
    : sector;

  return {
    assetProfile: {
      sector,
      industry,
      longBusinessSummary: String(stock.description || '').trim(),
      companyOfficers: [],
    },
    financialData: {
      targetMeanPrice: wrapRaw(targetPrice),
      grossMargins: Number.isFinite(grossMarginPct) ? wrapRaw(grossMarginPct / 100) : null,
      totalCash: wrapRaw(totalCash),
      totalDebt: wrapRaw(totalDebt),
      returnOnEquity: Number.isFinite(roePct) ? wrapRaw(roePct / 100) : null,
      debtToEquity: wrapRaw(deRatio),
      currentRatio: wrapRaw(currentRatio),
      freeCashflow: wrapRaw(freeCashflow),
      recommendationKey: parseRecommendationKey(stock.analystRating),
      epsCurrentYear: wrapRaw(epsCurrentYear),
      currentPrice: wrapRaw(parseCompactDollar(stock.price)),
      revenueGrowth: wrapRaw(revenueGrowth),
    },
    defaultKeyStatistics: {
      beta: wrapRaw(beta),
      returnOnEquity: Number.isFinite(roePct) ? wrapRaw(roePct / 100) : null,
      pegRatio: wrapRaw(peg),
      heldPercentInsiders: null,
    },
    calendarEvents: {
      earnings: {
        earningsDate: Number.isFinite(earningsDate) ? [wrapRaw(earningsDate)] : [],
      },
    },
    incomeStatementHistory: {
      incomeStatementHistory: annualRows,
    },
    incomeStatementHistoryQuarterly: {
      incomeStatementHistory: quarterlyRows,
    },
  };
}

function extractReportDate(fileName) {
  const base = path.basename(String(fileName || ''), '.json');
  const direct = /^(\d{4}-\d{2}-\d{2})$/u;
  const withTicker = /^.+-(\d{4}-\d{2}-\d{2})$/u;

  if (direct.test(base)) {
    return base;
  }

  const match = withTicker.exec(base);
  return match ? match[1] : null;
}

function loadLatestLocalSnapshot(dataDir, ticker) {
  const upperTicker = toUpperTicker(ticker);
  if (!upperTicker) {
    return null;
  }

  const tickerDir = path.join(dataDir, upperTicker);
  if (!fs.existsSync(tickerDir) || !fs.statSync(tickerDir).isDirectory()) {
    return null;
  }

  const files = fs.readdirSync(tickerDir, { withFileTypes: true })
    .filter(item => item.isFile() && item.name.endsWith('.json'))
    .map(item => item.name)
    .sort((a, b) => {
      const dateA = extractReportDate(a) || '';
      const dateB = extractReportDate(b) || '';
      return dateB.localeCompare(dateA);
    });

  if (files.length === 0) {
    return null;
  }

  const latestFile = files[0];
  const fullPath = path.join(tickerDir, latestFile);
  try {
    const stock = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    return {
      ticker: upperTicker,
      filePath: fullPath,
      relativePath: path.join('data', upperTicker, latestFile),
      reportDate: extractReportDate(latestFile),
      stock,
    };
  } catch (error) {
    return null;
  }
}

module.exports = {
  buildQuoteFromSnapshot,
  buildSummaryFromSnapshot,
  loadLatestLocalSnapshot,
  parseCompactDollar,
  parseWeekRange,
};
