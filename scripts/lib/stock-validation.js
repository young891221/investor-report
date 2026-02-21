const fs = require('node:fs');
const path = require('node:path');

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDateString(value) {
  if (!ISO_DATE_RE.test(String(value || '').trim())) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() + 1 === month &&
    utcDate.getUTCDate() === day
  );
}

function extractReportDate(fileName) {
  const base = path.basename(String(fileName || ''), '.json');
  const withTickerPrefix = /^.+-(\d{4}-\d{2}-\d{2})$/u;
  const direct = /^(\d{4}-\d{2}-\d{2})$/u;

  if (direct.test(base)) {
    return base;
  }

  const match = withTickerPrefix.exec(base);
  return match ? match[1] : null;
}

function addError(errors, field, message) {
  errors.push(`${field}: ${message}`);
}

function requireObject(root, key, errors, parent = 'root') {
  const value = root[key];
  if (!isObject(value)) {
    addError(errors, `${parent}.${key}`, 'must be an object');
    return null;
  }
  return value;
}

function requireString(root, key, errors, parent = 'root') {
  const value = root[key];
  if (typeof value !== 'string' || value.trim() === '') {
    addError(errors, `${parent}.${key}`, 'must be a non-empty string');
    return null;
  }
  return value;
}

function requireNumber(root, key, errors, parent = 'root') {
  const value = root[key];
  if (typeof value !== 'number' || Number.isNaN(value)) {
    addError(errors, `${parent}.${key}`, 'must be a number');
    return null;
  }
  return value;
}

function requireArray(root, key, errors, parent = 'root') {
  const value = root[key];
  if (!Array.isArray(value)) {
    addError(errors, `${parent}.${key}`, 'must be an array');
    return null;
  }
  return value;
}

function ensureStringArray(array, field, errors, minLength = 0) {
  if (!Array.isArray(array)) {
    addError(errors, field, 'must be an array');
    return;
  }
  if (array.length < minLength) {
    addError(errors, field, `must have at least ${minLength} items`);
  }
  array.forEach((item, index) => {
    if (typeof item !== 'string' || item.trim() === '') {
      addError(errors, `${field}[${index}]`, 'must be a non-empty string');
    }
  });
}

function ensureTupleRows(rows, field, expectedLength, errors) {
  if (!Array.isArray(rows)) {
    addError(errors, field, 'must be an array');
    return;
  }

  rows.forEach((row, index) => {
    if (!Array.isArray(row)) {
      addError(errors, `${field}[${index}]`, 'must be an array');
      return;
    }

    if (row.length < expectedLength) {
      addError(errors, `${field}[${index}]`, `must contain at least ${expectedLength} items`);
      return;
    }

    row.forEach((value, valueIndex) => {
      if (typeof value !== 'string' || value.trim() === '') {
        addError(errors, `${field}[${index}][${valueIndex}]`, 'must be a non-empty string');
      }
    });
  });
}

function ensureNumberArray(array, field, errors, allowNull = false) {
  if (!Array.isArray(array)) {
    addError(errors, field, 'must be an array');
    return;
  }

  array.forEach((item, index) => {
    if (allowNull && item === null) {
      return;
    }
    if (typeof item !== 'number' || Number.isNaN(item)) {
      addError(errors, `${field}[${index}]`, 'must be a number');
    }
  });
}

function isValidHttpUrl(value) {
  if (typeof value !== 'string') {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function validateAnalystReportItem(item, index, sectionPath, errors) {
  if (!isObject(item)) {
    addError(errors, `${sectionPath}[${index}]`, 'must be an object');
    return;
  }

  requireString(item, 'title', errors, sectionPath);
  requireString(item, 'source', errors, sectionPath);
  requireString(item, 'link', errors, sectionPath);
  if (typeof item.link === 'string' && item.link.trim() && !isValidHttpUrl(item.link.trim())) {
    addError(errors, `${sectionPath}[${index}].link`, 'must be a valid http/https URL');
  }

  if (item.publishedDate !== undefined) {
    if (typeof item.publishedDate !== 'string' || !isIsoDateString(item.publishedDate)) {
      addError(errors, `${sectionPath}[${index}].publishedDate`, 'must use YYYY-MM-DD format');
    }
  }

  if (item.summary !== undefined) {
    requireString(item, 'summary', errors, sectionPath);
  }

  if (item.keyPoints !== undefined) {
    if (!Array.isArray(item.keyPoints)) {
      addError(errors, `${sectionPath}.keyPoints`, 'must be an array');
    } else {
      ensureStringArray(item.keyPoints, `${sectionPath}.keyPoints`, errors);
    }
  }
}

function validateStock(stock, options = {}) {
  const errors = [];
  if (!isObject(stock)) {
    return ['root: must be a JSON object'];
  }

  const basicFields = [
    'ticker',
    'companyName',
    'companyNameEn',
    'exchange',
    'sector',
    'description',
    'analysisDate',
    'price',
    'priceChange',
    'priceChangeDir',
    'marketCap',
    'marketCapChange',
    'weekRange',
    'analystRating',
    'analystTarget',
    'reportVerdict',
  ];

  basicFields.forEach(field => requireString(stock, field, errors));
  const reportScore = requireNumber(stock, 'reportScore', errors);

  if (!['up', 'down'].includes(stock.priceChangeDir)) {
    addError(errors, 'root.priceChangeDir', "must be either 'up' or 'down'");
  }

  if (typeof stock.analysisDate === 'string' && stock.analysisDate.trim() !== '') {
    if (!isIsoDateString(stock.analysisDate)) {
      addError(errors, 'root.analysisDate', 'must use YYYY-MM-DD format');
    }
  }

  if (
    Number.isFinite(reportScore) &&
    (reportScore < 0 || reportScore > 100)
  ) {
    addError(errors, 'root.reportScore', 'must be between 0 and 100');
  }

  const allowedVerdicts = ['STRONG BUY', 'BUY', 'HOLD', 'REDUCE', 'SELL'];
  if (!allowedVerdicts.includes(stock.reportVerdict)) {
    addError(errors, 'root.reportVerdict', `must be one of: ${allowedVerdicts.join(', ')}`);
  }

  const keyPoints = requireArray(stock, 'keyPoints', errors);
  ensureStringArray(keyPoints, 'root.keyPoints', errors, 5);

  const navSections = requireArray(stock, 'navSections', errors);
  if (Array.isArray(navSections) && navSections.length > 0) {
    navSections.forEach((section, index) => {
      if (!isObject(section)) {
        addError(errors, `root.navSections[${index}]`, 'must be an object');
        return;
      }
      requireString(section, 'id', errors, `root.navSections[${index}]`);
      requireString(section, 'label', errors, `root.navSections[${index}]`);
    });
  }

  const segments = requireArray(stock, 'segments', errors);
  if (Array.isArray(segments) && segments.length > 0) {
    segments.forEach((segment, index) => {
      if (!isObject(segment)) {
        addError(errors, `root.segments[${index}]`, 'must be an object');
        return;
      }
      ['name', 'icon', 'color', 'backlog', 'description', 'revenue'].forEach(field => {
        requireString(segment, field, errors, `root.segments[${index}]`);
      });
    });
  }

  const revenueBreakdown = requireObject(stock, 'revenueBreakdown', errors);
  if (revenueBreakdown) {
    const labels = requireArray(revenueBreakdown, 'labels', errors, 'root.revenueBreakdown');
    const data = requireArray(revenueBreakdown, 'data', errors, 'root.revenueBreakdown');
    const colors = requireArray(revenueBreakdown, 'colors', errors, 'root.revenueBreakdown');
    ensureStringArray(labels, 'root.revenueBreakdown.labels', errors, 1);
    ensureNumberArray(data, 'root.revenueBreakdown.data', errors);
    ensureStringArray(colors, 'root.revenueBreakdown.colors', errors, 1);

    if (Array.isArray(labels) && Array.isArray(data) && labels.length !== data.length) {
      addError(errors, 'root.revenueBreakdown', 'labels and data must have the same length');
    }
    if (Array.isArray(labels) && Array.isArray(colors) && labels.length !== colors.length) {
      addError(errors, 'root.revenueBreakdown', 'labels and colors must have the same length');
    }
  }

  const annualRevenue = requireObject(stock, 'annualRevenue', errors);
  if (annualRevenue) {
    const labels = requireArray(annualRevenue, 'labels', errors, 'root.annualRevenue');
    const data = requireArray(annualRevenue, 'data', errors, 'root.annualRevenue');
    ensureStringArray(labels, 'root.annualRevenue.labels', errors, 1);
    ensureNumberArray(data, 'root.annualRevenue.data', errors);
    const estimateStartIndex = requireNumber(annualRevenue, 'estimateStartIndex', errors, 'root.annualRevenue');

    if (Array.isArray(labels) && Array.isArray(data) && labels.length !== data.length) {
      addError(errors, 'root.annualRevenue', 'labels and data must have the same length');
    }
    if (Number.isInteger(estimateStartIndex) && Array.isArray(labels)) {
      if (estimateStartIndex < 0 || estimateStartIndex >= labels.length) {
        addError(errors, 'root.annualRevenue.estimateStartIndex', 'must be within labels range');
      }
    } else if (estimateStartIndex !== null) {
      addError(errors, 'root.annualRevenue.estimateStartIndex', 'must be an integer');
    }
  }

  const quarterlyRevenue = requireObject(stock, 'quarterlyRevenue', errors);
  if (quarterlyRevenue) {
    const labels = requireArray(quarterlyRevenue, 'labels', errors, 'root.quarterlyRevenue');
    const data = requireArray(quarterlyRevenue, 'data', errors, 'root.quarterlyRevenue');
    ensureStringArray(labels, 'root.quarterlyRevenue.labels', errors, 1);
    ensureNumberArray(data, 'root.quarterlyRevenue.data', errors);

    if (Array.isArray(labels) && Array.isArray(data) && labels.length !== data.length) {
      addError(errors, 'root.quarterlyRevenue', 'labels and data must have the same length');
    }
  }

  const marginTrend = requireObject(stock, 'marginTrend', errors);
  if (marginTrend) {
    const labels = requireArray(marginTrend, 'labels', errors, 'root.marginTrend');
    const gaap = requireArray(marginTrend, 'gaap', errors, 'root.marginTrend');
    const nonGaap = requireArray(marginTrend, 'nonGaap', errors, 'root.marginTrend');

    ensureStringArray(labels, 'root.marginTrend.labels', errors, 1);
    ensureNumberArray(gaap, 'root.marginTrend.gaap', errors, true);
    ensureNumberArray(nonGaap, 'root.marginTrend.nonGaap', errors, true);

    if (Array.isArray(labels) && Array.isArray(gaap) && labels.length !== gaap.length) {
      addError(errors, 'root.marginTrend', 'labels and gaap must have the same length');
    }
    if (Array.isArray(labels) && Array.isArray(nonGaap) && labels.length !== nonGaap.length) {
      addError(errors, 'root.marginTrend', 'labels and nonGaap must have the same length');
    }
  }

  const financialTable = requireArray(stock, 'financialTable', errors);
  ensureTupleRows(financialTable, 'root.financialTable', 6, errors);

  const valuation = requireObject(stock, 'valuation', errors);
  if (valuation) {
    const labels = requireArray(valuation, 'labels', errors, 'root.valuation');
    const company = requireArray(valuation, 'company', errors, 'root.valuation');
    const industry = requireArray(valuation, 'industry', errors, 'root.valuation');

    ensureStringArray(labels, 'root.valuation.labels', errors, 1);
    ensureNumberArray(company, 'root.valuation.company', errors);
    ensureNumberArray(industry, 'root.valuation.industry', errors);

    if (Array.isArray(labels) && Array.isArray(company) && labels.length !== company.length) {
      addError(errors, 'root.valuation', 'labels and company must have the same length');
    }
    if (Array.isArray(labels) && Array.isArray(industry) && labels.length !== industry.length) {
      addError(errors, 'root.valuation', 'labels and industry must have the same length');
    }
  }

  const financialHealth = requireArray(stock, 'financialHealth', errors);
  if (Array.isArray(financialHealth) && financialHealth.length > 0) {
    financialHealth.forEach((item, index) => {
      if (!isObject(item)) {
        addError(errors, `root.financialHealth[${index}]`, 'must be an object');
        return;
      }
      ['label', 'value', 'width', 'gradient'].forEach(field => {
        requireString(item, field, errors, `root.financialHealth[${index}]`);
      });
    });
  }

  const healthMetrics = requireArray(stock, 'healthMetrics', errors);
  if (Array.isArray(healthMetrics) && healthMetrics.length > 0) {
    healthMetrics.forEach((item, index) => {
      if (!isObject(item)) {
        addError(errors, `root.healthMetrics[${index}]`, 'must be an object');
        return;
      }
      ['label', 'value', 'color'].forEach(field => {
        requireString(item, field, errors, `root.healthMetrics[${index}]`);
      });
    });
  }

  const timeline = requireArray(stock, 'timeline', errors);
  if (Array.isArray(timeline) && timeline.length > 0) {
    timeline.forEach((item, index) => {
      if (!isObject(item)) {
        addError(errors, `root.timeline[${index}]`, 'must be an object');
        return;
      }
      ['date', 'text', 'status'].forEach(field => {
        requireString(item, field, errors, `root.timeline[${index}]`);
      });
      if (!['done', 'pending'].includes(item.status)) {
        addError(errors, `root.timeline[${index}].status`, "must be either 'done' or 'pending'");
      }
    });
  }

  const competitorChart = requireObject(stock, 'competitorChart', errors);
  if (competitorChart) {
    const labels = requireArray(competitorChart, 'labels', errors, 'root.competitorChart');
    const data = requireArray(competitorChart, 'data', errors, 'root.competitorChart');
    const colors = requireArray(competitorChart, 'colors', errors, 'root.competitorChart');

    ensureStringArray(labels, 'root.competitorChart.labels', errors, 1);
    ensureNumberArray(data, 'root.competitorChart.data', errors);
    ensureStringArray(colors, 'root.competitorChart.colors', errors, 1);
    requireString(competitorChart, 'chartLabel', errors, 'root.competitorChart');
    requireString(competitorChart, 'yLabel', errors, 'root.competitorChart');

    if (Array.isArray(labels) && Array.isArray(data) && labels.length !== data.length) {
      addError(errors, 'root.competitorChart', 'labels and data must have the same length');
    }
    if (Array.isArray(labels) && Array.isArray(colors) && labels.length !== colors.length) {
      addError(errors, 'root.competitorChart', 'labels and colors must have the same length');
    }
  }

  const competitorTable = requireObject(stock, 'competitorTable', errors);
  if (competitorTable) {
    const headers = requireArray(competitorTable, 'headers', errors, 'root.competitorTable');
    const rows = requireArray(competitorTable, 'rows', errors, 'root.competitorTable');
    ensureStringArray(headers, 'root.competitorTable.headers', errors, 1);
    if (Array.isArray(rows)) {
      rows.forEach((row, index) => {
        if (!Array.isArray(row)) {
          addError(errors, `root.competitorTable.rows[${index}]`, 'must be an array');
          return;
        }
        if (Array.isArray(headers) && row.length !== headers.length) {
          addError(errors, `root.competitorTable.rows[${index}]`, 'row length must match headers length');
        }
        row.forEach((cell, cellIndex) => {
          if (typeof cell !== 'string' || cell.trim() === '') {
            addError(errors, `root.competitorTable.rows[${index}][${cellIndex}]`, 'must be a non-empty string');
          }
        });
      });
    }
  }

  const risks = requireObject(stock, 'risks', errors);
  if (risks) {
    const items = requireArray(risks, 'items', errors, 'root.risks');
    const warnings = requireArray(risks, 'warnings', errors, 'root.risks');

    if (Array.isArray(items) && items.length > 0) {
      items.forEach((item, index) => {
        if (!isObject(item)) {
          addError(errors, `root.risks.items[${index}]`, 'must be an object');
          return;
        }
        requireString(item, 'label', errors, `root.risks.items[${index}]`);
        requireNumber(item, 'x', errors, `root.risks.items[${index}]`);
        requireNumber(item, 'y', errors, `root.risks.items[${index}]`);
        requireNumber(item, 'r', errors, `root.risks.items[${index}]`);
        requireString(item, 'bg', errors, `root.risks.items[${index}]`);
        requireString(item, 'border', errors, `root.risks.items[${index}]`);
      });
    }

    ensureStringArray(warnings, 'root.risks.warnings', errors, 1);
  }

  const radar = requireObject(stock, 'radar', errors);
  if (radar) {
    const labels = requireArray(radar, 'labels', errors, 'root.radar');
    const data = requireArray(radar, 'data', errors, 'root.radar');
    ensureStringArray(labels, 'root.radar.labels', errors, 1);
    ensureNumberArray(data, 'root.radar.data', errors);
    if (Array.isArray(labels) && Array.isArray(data) && labels.length !== data.length) {
      addError(errors, 'root.radar', 'labels and data must have the same length');
    }
  }

  const bullCase = requireArray(stock, 'bullCase', errors);
  ensureStringArray(bullCase, 'root.bullCase', errors, 1);

  const bearCase = requireArray(stock, 'bearCase', errors);
  ensureStringArray(bearCase, 'root.bearCase', errors, 1);

  const checklist = requireArray(stock, 'checklist', errors);
  ensureTupleRows(checklist, 'root.checklist', 3, errors);

  const moats = requireArray(stock, 'moats', errors);
  if (Array.isArray(moats) && moats.length > 0) {
    moats.forEach((moat, index) => {
      if (!isObject(moat)) {
        addError(errors, `root.moats[${index}]`, 'must be an object');
        return;
      }
      ['icon', 'name', 'desc'].forEach(field => {
        requireString(moat, field, errors, `root.moats[${index}]`);
      });
      });
  }

  const analystReports = stock.analystReports;
  if (analystReports !== undefined) {
    if (!isObject(analystReports)) {
      addError(errors, 'root.analystReports', 'must be an object');
    } else {
      const sections = ['domestic', 'international'];
      sections.forEach(sectionName => {
        const section = analystReports[sectionName];
        const sectionPath = `root.analystReports.${sectionName}`;
        if (section === undefined) {
          return;
        }
        if (!Array.isArray(section)) {
          addError(errors, sectionPath, 'must be an array');
          return;
        }
        section.forEach((item, index) => {
          validateAnalystReportItem(item, index, `${sectionPath}[${index}]`, errors);
        });
      });
    }
  }

  if (options.expectedTicker && stock.ticker !== options.expectedTicker) {
    addError(
      errors,
      'root.ticker',
      `must match directory name (${options.expectedTicker})`
    );
  }

  if (
    options.expectedDate &&
    typeof stock.analysisDate === 'string' &&
    stock.analysisDate !== options.expectedDate
  ) {
    addError(
      errors,
      'root.analysisDate',
      `must match file date (${options.expectedDate})`
    );
  }

  return errors;
}

function readStockFiles(dataDir) {
  const dirEntries = fs.readdirSync(dataDir, { withFileTypes: true });
  const files = [];

  dirEntries.forEach(entry => {
    if (entry.isDirectory()) {
      if (entry.name === 'sources') {
        return;
      }

      const ticker = entry.name.toUpperCase();
      const tickerDir = path.join(dataDir, entry.name);
      const reportFiles = fs.readdirSync(tickerDir, { withFileTypes: true })
        .filter(item => item.isFile() && item.name.endsWith('.json'))
        .map(item => item.name)
        .sort();

      reportFiles.forEach(reportFile => {
        const fullPath = path.join(tickerDir, reportFile);
        const expectedDate = extractReportDate(reportFile);
        if (!expectedDate) {
          throw new Error(`Invalid report filename format: ${reportFile}`);
        }

        const raw = fs.readFileSync(fullPath, 'utf8');
        files.push({
          file: `${entry.name}/${reportFile}`,
          fullPath,
          expectedTicker: ticker,
          expectedDate,
          json: JSON.parse(raw),
        });
      });
      return;
    }

    if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'index.json') {
      const fullPath = path.join(dataDir, entry.name);
      const raw = fs.readFileSync(fullPath, 'utf8');
      files.push({
        file: entry.name,
        fullPath,
        expectedTicker: path.basename(entry.name, '.json').toUpperCase(),
        expectedDate: null,
        json: JSON.parse(raw),
      });
    }
  });

  return files.sort((a, b) => a.file.localeCompare(b.file));
}

module.exports = {
  readStockFiles,
  validateStock,
};
