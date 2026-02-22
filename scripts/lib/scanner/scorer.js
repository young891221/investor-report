function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function formatCompactDollar(value) {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${round(value / 1e12, 1)}T`;
  if (abs >= 1e9) return `$${round(value / 1e9, 1)}B`;
  if (abs >= 1e6) return `$${round(value / 1e6, 1)}M`;
  return `$${round(value, 0)}`;
}

const WEIGHTS = { small_cap: 25, roe_quality: 20, reinvestment: 20, reasonable_per: 20, founder_led: 15 };

function neutralScore(weight) { return Math.round(weight / 2); }

function statusFromScore(score, weight) {
  if (!Number.isFinite(score) || !Number.isFinite(weight) || weight <= 0) return 'unknown';
  if (score >= Math.round(weight * 0.75)) return 'pass';
  if (score >= Math.round(weight * 0.45)) return 'watch';
  return 'fail';
}

function scoreSmallCap(marketCap) {
  const w = WEIGHTS.small_cap;
  if (!Number.isFinite(marketCap)) return { id: 'small_cap', label: '시가총액이 작고 성장 여력이 큼', weight: w, score: neutralScore(w), status: 'unknown', evidence: '시가총액 데이터 미확보' };
  let s = 4;
  if (marketCap < 2e10) s = w;
  else if (marketCap < 3e10) s = 18;
  else if (marketCap < 5e10) s = 12;
  else if (marketCap < 1e11) s = 7;
  return { id: 'small_cap', label: '시가총액이 작고 성장 여력이 큼', weight: w, score: s, status: statusFromScore(s, w), evidence: `시가총액 ${formatCompactDollar(marketCap)}` };
}

function scoreRoe(roePct) {
  const w = WEIGHTS.roe_quality;
  if (!Number.isFinite(roePct)) return { id: 'roe_quality', label: 'ROE 15~20% 고수익 구조', weight: w, score: neutralScore(w), status: 'unknown', evidence: 'ROE 데이터 미확보' };
  let s = 6;
  if (roePct >= 15 && roePct <= 20) s = w;
  else if ((roePct >= 12 && roePct < 15) || (roePct > 20 && roePct <= 25)) s = 16;
  else if ((roePct >= 8 && roePct < 12) || (roePct > 25 && roePct <= 30)) s = 12;
  else if ((roePct >= 0 && roePct < 8) || (roePct > 30 && roePct <= 40)) s = 7;
  else if (roePct < 0) s = 2;
  return { id: 'roe_quality', label: 'ROE 15~20% 고수익 구조', weight: w, score: s, status: statusFromScore(s, w), evidence: `ROE ${round(roePct, 2)}%` };
}

function scoreReinvestment(input) {
  const w = WEIGHTS.reinvestment;
  const growthPct = Number.isFinite(input.revenueGrowthPct) ? input.revenueGrowthPct : null;
  const fcf = input.freeCashflow;
  const nc = input.netCash;
  const cr = input.currentRatio;
  let total = 0, count = 0;
  const parts = [];

  if (Number.isFinite(growthPct)) {
    if (growthPct >= 25) total += 10; else if (growthPct >= 15) total += 8; else if (growthPct >= 5) total += 6; else if (growthPct >= 0) total += 5; else total += 3;
    count++; parts.push(`성장률 ${round(growthPct, 1)}%`);
  }
  if (Number.isFinite(fcf)) {
    total += fcf > 0 ? 8 : fcf === 0 ? 6 : 4;
    count++; parts.push(`FCF ${formatCompactDollar(fcf)}`);
  }
  if (Number.isFinite(nc) || Number.isFinite(cr)) {
    let bs = 3;
    if (Number.isFinite(nc) && nc > 0 && Number.isFinite(cr) && cr >= 1.5) bs = 8;
    else if ((Number.isFinite(nc) && nc > 0) || (Number.isFinite(cr) && cr >= 1.5)) bs = 6;
    else if (Number.isFinite(cr) && cr >= 1) bs = 5;
    total += bs; count++;
  }

  if (count === 0) return { id: 'reinvestment', label: '이익의 효율적 재투자(복리)', weight: w, score: neutralScore(w), status: 'unknown', evidence: '데이터 미확보' };
  const s = clamp(Math.round((total / count / 10) * w), 0, w);
  return { id: 'reinvestment', label: '이익의 효율적 재투자(복리)', weight: w, score: s, status: statusFromScore(s, w), evidence: parts.join(' · ') };
}

function scorePer(trailingPE, forwardPE) {
  const w = WEIGHTS.reasonable_per;
  const pe = Number.isFinite(trailingPE) && trailingPE > 0 ? trailingPE : Number.isFinite(forwardPE) && forwardPE > 0 ? forwardPE : null;
  if (!Number.isFinite(pe)) return { id: 'reasonable_per', label: 'PER이 과열되지 않은 안전마진', weight: w, score: neutralScore(w), status: 'unknown', evidence: 'PER 데이터 미확보' };
  let s = 4;
  if (pe <= 0) s = 4;
  else if (pe >= 8 && pe <= 30) s = w;
  else if ((pe >= 5 && pe < 8) || (pe > 30 && pe <= 40)) s = 14;
  else if ((pe >= 2 && pe < 5) || (pe > 40 && pe <= 60)) s = 8;
  return { id: 'reasonable_per', label: 'PER이 과열되지 않은 안전마진', weight: w, score: s, status: statusFromScore(s, w), evidence: `P/E ${round(pe, 2)}x` };
}

function scoreFounder(companyOfficers, insiderOwnershipPct) {
  const w = WEIGHTS.founder_led;
  const officers = Array.isArray(companyOfficers) ? companyOfficers : [];
  const ceoPattern = /(chief executive officer|ceo)/i;
  const founderPattern = /(founder|co-founder|cofounder|founding)/i;
  let isFounderCeo = null;

  for (const o of officers) {
    const title = String(o && o.title || '');
    if (ceoPattern.test(title)) {
      isFounderCeo = founderPattern.test(title);
      break;
    }
  }

  const hasInsider = Number.isFinite(insiderOwnershipPct);
  if (isFounderCeo === null && !hasInsider) return { id: 'founder_led', label: '창업자 주도 운영', weight: w, score: neutralScore(w), status: 'unknown', evidence: '데이터 미확보' };

  let s = 5;
  if (isFounderCeo && hasInsider && insiderOwnershipPct >= 5) s = w;
  else if (isFounderCeo) s = 13;
  else if (hasInsider && insiderOwnershipPct >= 8) s = 10;
  else if (hasInsider && insiderOwnershipPct >= 3) s = 8;
  else if (isFounderCeo === false && !hasInsider) s = 6;

  return { id: 'founder_led', label: '창업자 주도 운영', weight: w, score: s, status: statusFromScore(s, w), evidence: `Founder CEO: ${isFounderCeo === true ? '예' : isFounderCeo === false ? '아니오' : '미확인'}, 내부자 지분: ${hasInsider ? `${round(insiderOwnershipPct, 2)}%` : '미확인'}` };
}

function scoreCandidate(data) {
  const criteria = [
    scoreSmallCap(data.marketCap),
    scoreRoe(data.roePct),
    scoreReinvestment({
      revenueGrowthPct: data.revenueGrowthPct,
      freeCashflow: data.freeCashflow,
      netCash: data.netCash,
      currentRatio: data.currentRatio,
    }),
    scorePer(data.trailingPE, data.forwardPE),
    scoreFounder(data.companyOfficers, data.insiderOwnershipPct),
  ];

  const total = clamp(criteria.reduce((sum, c) => sum + c.score, 0), 0, 100);
  return { model: '100x-book-v1', total, criteria };
}

module.exports = { scoreCandidate };
