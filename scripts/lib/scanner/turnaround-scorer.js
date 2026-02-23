function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function statusFromScore(score, weight) {
  if (!Number.isFinite(score) || !Number.isFinite(weight) || weight <= 0) return 'unknown';
  if (score >= Math.round(weight * 0.75)) return 'pass';
  if (score >= Math.round(weight * 0.45)) return 'watch';
  return 'fail';
}

function linearSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * margin_recovery (30 points)
 * Measures V-shaped recovery in quarterly operating margins.
 */
function scoreMarginRecovery(quarters) {
  const weight = 30;
  if (!Array.isArray(quarters) || quarters.length < 3) {
    return {
      id: 'margin_recovery',
      label: 'Margin 회복 추세',
      weight,
      score: Math.round(weight / 2),
      status: 'unknown',
      evidence: '분기 데이터 부족으로 중립 처리',
    };
  }

  const margins = quarters.map(q => {
    if (!Number.isFinite(q.operatingIncome) || !Number.isFinite(q.totalRevenue) || q.totalRevenue === 0) {
      return null;
    }
    return (q.operatingIncome / q.totalRevenue) * 100;
  });

  const validMargins = margins.filter(m => m !== null);
  if (validMargins.length < 3) {
    return {
      id: 'margin_recovery',
      label: 'Margin 회복 추세',
      weight,
      score: Math.round(weight / 2),
      status: 'unknown',
      evidence: '영업이익률 데이터 부족으로 중립 처리',
    };
  }

  const slope = linearSlope(validMargins);
  const troughIdx = validMargins.indexOf(Math.min(...validMargins));
  const lastMargin = validMargins[validMargins.length - 1];
  const troughMargin = validMargins[troughIdx];
  const recoveryPp = lastMargin - troughMargin;
  const troughInFirstHalf = troughIdx < validMargins.length / 2;

  let score;
  if (troughInFirstHalf && recoveryPp >= 10 && slope > 0.5) {
    score = 30;
  } else if (recoveryPp >= 5 && slope > 0) {
    score = 24;
  } else if (slope > 0 && recoveryPp > 0) {
    score = 18;
  } else if (slope >= -0.2 && slope <= 0.2) {
    score = 12;
  } else if (slope < 0 && lastMargin >= 0) {
    score = 8;
  } else {
    score = 4;
  }

  return {
    id: 'margin_recovery',
    label: 'Margin 회복 추세',
    weight,
    score,
    status: statusFromScore(score, weight),
    evidence: `영업이익률 기울기 ${round(slope, 2)}, 저점 대비 회복 ${round(recoveryPp, 1)}pp, 최신 ${round(lastMargin, 1)}%`,
  };
}

/**
 * revenue_reaccel (30 points)
 * Measures YoY revenue growth acceleration.
 */
function scoreRevenueReaccel(quarters) {
  const weight = 30;
  if (!Array.isArray(quarters) || quarters.length < 5) {
    return {
      id: 'revenue_reaccel',
      label: '매출 재가속',
      weight,
      score: Math.round(weight / 2),
      status: 'unknown',
      evidence: '분기 데이터 부족 (<5분기)으로 중립 처리',
    };
  }

  // Calculate YoY growth rates for quarters that have a year-ago counterpart
  const yoyRates = [];
  for (let i = 4; i < quarters.length; i++) {
    const current = quarters[i].totalRevenue;
    const yearAgo = quarters[i - 4].totalRevenue;
    if (Number.isFinite(current) && Number.isFinite(yearAgo) && yearAgo !== 0) {
      yoyRates.push(((current - yearAgo) / Math.abs(yearAgo)) * 100);
    }
  }

  if (yoyRates.length < 2) {
    // Fallback: use QoQ if available
    const qoqRates = [];
    for (let i = 1; i < quarters.length; i++) {
      const current = quarters[i].totalRevenue;
      const prev = quarters[i - 1].totalRevenue;
      if (Number.isFinite(current) && Number.isFinite(prev) && prev !== 0) {
        qoqRates.push(((current - prev) / Math.abs(prev)) * 100);
      }
    }

    if (qoqRates.length < 2) {
      return {
        id: 'revenue_reaccel',
        label: '매출 재가속',
        weight,
        score: Math.round(weight / 2),
        status: 'unknown',
        evidence: 'YoY/QoQ 성장률 계산 불가로 중립 처리',
      };
    }

    const firstRate = qoqRates[0];
    const lastRate = qoqRates[qoqRates.length - 1];
    const accel = lastRate - firstRate;
    return scoreRevenueFromRates(weight, accel, lastRate, `QoQ 기반: 가속도 ${round(accel, 1)}pp, 최신 QoQ ${round(lastRate, 1)}%`);
  }

  const firstRate = yoyRates[0];
  const lastRate = yoyRates[yoyRates.length - 1];
  const acceleration = lastRate - firstRate;

  return scoreRevenueFromRates(weight, acceleration, lastRate, `YoY 가속도 ${round(acceleration, 1)}pp, 최신 YoY ${round(lastRate, 1)}%`);
}

function scoreRevenueFromRates(weight, acceleration, latestRate, evidenceText) {
  let score;
  if (acceleration >= 15 && latestRate > 0) {
    score = 30;
  } else if (acceleration >= 8 && latestRate > 0) {
    score = 24;
  } else if (acceleration > 0 && latestRate > 0) {
    score = 20;
  } else if (latestRate > 15) {
    score = 18;
  } else if (acceleration > 0 && latestRate <= 0) {
    score = 14;
  } else if (latestRate > 0 && acceleration >= -5) {
    score = 12;
  } else if (latestRate > 0 && acceleration < -5) {
    score = 8;
  } else {
    score = 4;
  }

  return {
    id: 'revenue_reaccel',
    label: '매출 재가속',
    weight,
    score,
    status: statusFromScore(score, weight),
    evidence: evidenceText,
  };
}

/**
 * cash_flow_turn (25 points)
 * Measures cash flow turnaround: net income trajectory + FCF + cash buffer.
 */
function scoreCashFlowTurn(quarters, financialData) {
  const weight = 25;
  const fd = financialData || {};
  const fcf = Number.isFinite(fd.freeCashflow) ? fd.freeCashflow : null;
  const totalCash = Number.isFinite(fd.totalCash) ? fd.totalCash : null;
  const totalDebt = Number.isFinite(fd.totalDebt) ? fd.totalDebt : null;
  const hasCashBuffer = Number.isFinite(totalCash) && Number.isFinite(totalDebt) && totalCash > totalDebt;
  const fcfPositive = fcf !== null && fcf > 0;

  if (!Array.isArray(quarters) || quarters.length < 2) {
    // Score based on FCF and cash only
    let score = Math.round(weight / 2);
    if (fcfPositive && hasCashBuffer) score = 16;
    else if (fcfPositive) score = 16;
    else if (hasCashBuffer) score = 8;

    return {
      id: 'cash_flow_turn',
      label: 'Cash Flow 턴어라운드',
      weight,
      score,
      status: statusFromScore(score, weight),
      evidence: `분기 데이터 부족, FCF ${fcf !== null ? formatCompact(fcf) : 'N/A'}`,
    };
  }

  const netIncomes = quarters
    .map(q => q.netIncome)
    .filter(n => Number.isFinite(n));

  if (netIncomes.length < 2) {
    let score = Math.round(weight / 2);
    if (fcfPositive) score = 16;
    return {
      id: 'cash_flow_turn',
      label: 'Cash Flow 턴어라운드',
      weight,
      score,
      status: statusFromScore(score, weight),
      evidence: `순이익 데이터 부족, FCF ${fcf !== null ? formatCompact(fcf) : 'N/A'}`,
    };
  }

  const mid = Math.floor(netIncomes.length / 2);
  const firstHalf = netIncomes.slice(0, mid);
  const secondHalf = netIncomes.slice(mid);
  const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
  const improving = avgSecond > avgFirst;
  const lossToProfit = avgFirst < 0 && avgSecond > 0;

  let score;
  if (lossToProfit && fcfPositive) {
    score = 25;
  } else if (fcfPositive && improving) {
    score = 22;
  } else if (lossToProfit) {
    score = 20;
  } else if (fcfPositive) {
    score = 16;
  } else if (improving && hasCashBuffer) {
    score = 14;
  } else if (improving) {
    score = 10;
  } else if (hasCashBuffer) {
    score = 8;
  } else {
    score = 3;
  }

  const evidenceParts = [
    `순이익 전반부 avg ${formatCompact(avgFirst)} → 후반부 avg ${formatCompact(avgSecond)}`,
    `FCF ${fcf !== null ? formatCompact(fcf) : 'N/A'}`,
  ];
  if (hasCashBuffer) evidenceParts.push('순현금 양호');

  return {
    id: 'cash_flow_turn',
    label: 'Cash Flow 턴어라운드',
    weight,
    score,
    status: statusFromScore(score, weight),
    evidence: evidenceParts.join(', '),
  };
}

/**
 * valuation_setup (15 points)
 * Measures asymmetric valuation setup: cheap + improving fundamentals.
 */
function scoreValuationSetup(quote, marginScore, revenueScore) {
  const weight = 15;
  const q = quote || {};
  const pe = Number.isFinite(q.trailingPE) && q.trailingPE > 0 ? q.trailingPE
    : Number.isFinite(q.forwardPE) && q.forwardPE > 0 ? q.forwardPE
      : null;
  const ps = Number.isFinite(q.priceToSalesTrailing12Months) && q.priceToSalesTrailing12Months > 0
    ? q.priceToSalesTrailing12Months : null;

  // Determine if fundamentals are improving (from other criterion scores)
  const fundamentalsImproving = (marginScore >= 18 || revenueScore >= 18);
  const isPeLoss = pe === null && Number.isFinite(q.trailingPE) && q.trailingPE <= 0;

  let score;
  let evidence;

  if (pe !== null) {
    if (pe < 15 && fundamentalsImproving) {
      score = 15;
      evidence = `P/E ${round(pe, 1)}x + 펀더멘털 개선 중`;
    } else if (pe < 25 && fundamentalsImproving) {
      score = 12;
      evidence = `P/E ${round(pe, 1)}x + 펀더멘털 개선 중`;
    } else if (pe < 15) {
      score = 10;
      evidence = `P/E ${round(pe, 1)}x (저평가이나 개선 미확인)`;
    } else if (pe < 30) {
      score = 8;
      evidence = `P/E ${round(pe, 1)}x`;
    } else if (pe <= 50) {
      score = 5;
      evidence = `P/E ${round(pe, 1)}x (고평가 구간)`;
    } else {
      score = 3;
      evidence = `P/E ${round(pe, 1)}x (과열)`;
    }
  } else if (isPeLoss && ps !== null) {
    if (ps < 3 && fundamentalsImproving) {
      score = 12;
      evidence = `적자 기업, P/S ${round(ps, 1)}x + 펀더멘털 개선 중`;
    } else if (ps < 5) {
      score = 5;
      evidence = `적자 기업, P/S ${round(ps, 1)}x`;
    } else {
      score = 3;
      evidence = `적자 기업, P/S ${round(ps, 1)}x (고평가)`;
    }
  } else {
    score = Math.round(weight / 2);
    evidence = '밸류에이션 데이터 미확보로 중립 처리';
  }

  return {
    id: 'valuation_setup',
    label: '밸류에이션 셋업',
    weight,
    score,
    status: statusFromScore(score, weight),
    evidence,
  };
}

function formatCompact(value) {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${round(abs / 1e9, 1)}B`;
  if (abs >= 1e6) return `${sign}$${round(abs / 1e6, 1)}M`;
  if (abs >= 1e3) return `${sign}$${round(abs / 1e3, 1)}K`;
  return `${sign}$${round(abs, 0)}`;
}

/**
 * Main scoring function for turnaround-v1 model.
 *
 * @param {object} data - { quarters, financialData, quote }
 * @returns {{ model: string, total: number, criteria: Array }}
 */
function scoreTurnaroundCandidate(data) {
  const quarters = Array.isArray(data.quarters) ? data.quarters : [];
  const financialData = data.financialData || {};
  const quote = data.quote || {};

  const marginResult = scoreMarginRecovery(quarters);
  const revenueResult = scoreRevenueReaccel(quarters);
  const cashFlowResult = scoreCashFlowTurn(quarters, financialData);
  const valuationResult = scoreValuationSetup(quote, marginResult.score, revenueResult.score);

  const criteria = [marginResult, revenueResult, cashFlowResult, valuationResult];
  const total = clamp(criteria.reduce((sum, c) => sum + c.score, 0), 0, 100);

  return {
    model: 'turnaround-v1',
    total,
    criteria,
  };
}

module.exports = { scoreTurnaroundCandidate };
