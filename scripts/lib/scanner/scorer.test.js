const { scoreCandidate } = require('./scorer');

const strong = scoreCandidate({
  marketCap: 5e9,
  roePct: 17,
  revenueGrowthPct: 30,
  freeCashflow: 200e6,
  netCash: 500e6,
  currentRatio: 2.0,
  trailingPE: 25,
  forwardPE: 20,
  companyOfficers: [{ title: 'Founder, CEO & Chairman' }],
  insiderOwnershipPct: 12,
});

console.assert(strong.total >= 70, `strong candidate should score >=70, got ${strong.total}`);
console.assert(strong.criteria.length === 5, 'should have 5 criteria');
console.assert(strong.criteria[0].id === 'small_cap', 'first criterion should be small_cap');

const weak = scoreCandidate({
  marketCap: 200e9,
  roePct: -5,
  revenueGrowthPct: -10,
  freeCashflow: -100e6,
  netCash: -500e6,
  currentRatio: 0.5,
  trailingPE: 100,
  forwardPE: 80,
  companyOfficers: [],
  insiderOwnershipPct: null,
});

console.assert(weak.total <= 40, `weak candidate should score <=40, got ${weak.total}`);

const missing = scoreCandidate({});
console.assert(missing.total >= 30 && missing.total <= 60, `missing data should get neutral score, got ${missing.total}`);
console.assert(missing.criteria.every(c => c.status === 'unknown' || typeof c.status === 'string'), 'should have valid statuses');

console.log('scorer.test.js: all passed');
