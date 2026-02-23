const { pickRaw } = require('./generator/sources');

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

module.exports = { pickRaw, toStatementRows, toQuarterlySeries, toAnnualSeries };
