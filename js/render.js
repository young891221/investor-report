/* ═══════════════════════════════════════════════════
   STOCK ANALYSIS — Render Engine v1.0
   CONFIG JSON → 자동 차트/테이블/UI 렌더링
   ═══════════════════════════════════════════════════ */

function renderDashboard(CONFIG) {
  // ── Chart.js Defaults ──
  Chart.defaults.font.family = "'Plus Jakarta Sans','Noto Sans KR',sans-serif";
  Chart.defaults.color = '#5e6e8a';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
  Chart.defaults.plugins.legend.labels.padding = 16;
  Chart.defaults.plugins.tooltip.backgroundColor = '#1a2236';
  Chart.defaults.plugins.tooltip.borderColor = '#253352';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.titleFont = {weight:'600'};
  Chart.defaults.elements.bar.borderRadius = 6;

  const C = CONFIG;
  const ensureArray = value => Array.isArray(value) ? value : [];
  const toNumber = value => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number(value.replaceAll(',', '').trim());
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };
  const ensureNumberArray = value => ensureArray(value).map(toNumber);
  const parseFlexibleNumber = value => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const cleaned = value.replaceAll(',', '').replace(/[xX%]/g, '').trim();
      if (!cleaned) {
        return null;
      }
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };
  const pegColor = value => {
    if (!Number.isFinite(value)) {
      return 'var(--text2)';
    }
    if (value <= 1) {
      return 'var(--green2)';
    }
    if (value <= 2) {
      return 'var(--orange)';
    }
    return 'var(--red2)';
  };
  const isPegUnavailable = value => {
    if (typeof value !== 'string') {
      return true;
    }
    const normalized = value.toLowerCase().trim();
    return (
      normalized.includes('n/a') ||
      normalized.includes('데이터 없음') ||
      normalized.includes('적자') ||
      normalized.includes('불가') ||
      normalized === '-' ||
      /^[-–—]+$/u.test(normalized)
    );
  };
  const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);
  const escapeHtml = value => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  const isReportUrl = value => /^https?:\/\/\S+/u.test(String(value || '').trim());
  const ensureSummary = value => typeof value === 'string' ? value.trim() : '';
  const deriveForwardPeg = () => {
    const pegInputs = C.pegInputs && typeof C.pegInputs === 'object' ? C.pegInputs : null;
    if (!pegInputs) {
      return null;
    }

    const forwardPE = parseFlexibleNumber(pegInputs.forwardPE);
    const epsGrowthPct = parseFlexibleNumber(pegInputs.epsGrowthPct);
    if (!Number.isFinite(forwardPE) || !Number.isFinite(epsGrowthPct) || forwardPE <= 0 || epsGrowthPct <= 0) {
      return null;
    }

    return {
      forwardPE,
      epsGrowthPct,
      peg: forwardPE / epsGrowthPct,
      basis: typeof pegInputs.basis === 'string' ? pegInputs.basis.trim() : '',
    };
  };
  const derivePsgProxy = () => {
    const valuationLabels = ensureArray(C.valuation && C.valuation.labels);
    const valuationCompany = ensureNumberArray(C.valuation && C.valuation.company);
    const psIndex = valuationLabels.findIndex(label =>
      typeof label === 'string' && label.toUpperCase().includes('P/S')
    );
    if (psIndex < 0) {
      return null;
    }

    const psRatio = valuationCompany[psIndex];
    if (!Number.isFinite(psRatio) || psRatio <= 0) {
      return null;
    }

    const annualLabels = ensureArray(C.annualRevenue && C.annualRevenue.labels);
    const annualData = ensureNumberArray(C.annualRevenue && C.annualRevenue.data);
    if (annualData.length < 2) {
      return null;
    }

    const estimateStartIndex = Number.isInteger(C.annualRevenue && C.annualRevenue.estimateStartIndex)
      ? C.annualRevenue.estimateStartIndex
      : annualData.length - 1;
    const baseIndex = estimateStartIndex - 1;
    if (baseIndex < 0 || estimateStartIndex >= annualData.length) {
      return null;
    }

    const baseRevenue = annualData[baseIndex];
    const nextRevenue = annualData[estimateStartIndex];
    if (!Number.isFinite(baseRevenue) || !Number.isFinite(nextRevenue) || baseRevenue <= 0 || nextRevenue <= 0) {
      return null;
    }

    const growthPct = ((nextRevenue - baseRevenue) / baseRevenue) * 100;
    if (!Number.isFinite(growthPct) || growthPct <= 0) {
      return null;
    }

    return {
      psRatio,
      growthPct,
      proxy: psRatio / growthPct,
      fromLabel: annualLabels[baseIndex] || String(baseIndex),
      toLabel: annualLabels[estimateStartIndex] || String(estimateStartIndex),
    };
  };
  const getCanvas = id => {
    const canvas = document.getElementById(id);
    if (!(canvas instanceof HTMLCanvasElement)) {
      console.warn(`[renderDashboard] missing canvas: ${id}`);
      return null;
    }
    return canvas;
  };
  const showChartPlaceholder = (id, message) => {
    const canvas = getCanvas(id);
    if (!canvas || !canvas.parentElement) {
      return;
    }
    canvas.parentElement.innerHTML = `<div class="chart-empty">${message}</div>`;
  };
  const safeNewChart = (id, config, errorMessage) => {
    const canvas = getCanvas(id);
    if (!canvas) {
      return null;
    }
    try {
      const chart = new Chart(canvas, config);
      return chart;
    } catch (error) {
      console.error(`[renderDashboard] chart render failed: ${id}`, error);
      showChartPlaceholder(id, errorMessage || '차트를 렌더링하지 못했습니다.');
      return null;
    }
  };
  const deriveReportScoreFromRadar = () => {
    const radarScores = ensureNumberArray(C.radar && C.radar.data);
    const weights = [0.24, 0.19, 0.16, 0.17, 0.12, 0.12];
    if (radarScores.length === 0) {
      return null;
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
      const clamped = Math.min(10, Math.max(1, value));
      weightedTotal += clamped * weight;
      totalWeight += weight;
    });

    if (totalWeight === 0) {
      return null;
    }
    return Math.round((weightedTotal / totalWeight) * 10);
  };
  const normalizeScoreCriterion = criterion => {
    if (!criterion || typeof criterion !== 'object') {
      return null;
    }

    const weight = parseFlexibleNumber(criterion.weight);
    const score = parseFlexibleNumber(criterion.score);
    const id = typeof criterion.id === 'string' ? criterion.id.trim() : '';
    const label = typeof criterion.label === 'string' ? criterion.label.trim() : '';
    const status = typeof criterion.status === 'string' ? criterion.status.trim().toLowerCase() : 'unknown';
    const evidence = typeof criterion.evidence === 'string' ? criterion.evidence.trim() : '';

    if (!label || !Number.isFinite(weight) || !Number.isFinite(score)) {
      return null;
    }

    return {
      id,
      label,
      weight: Math.max(0, Math.round(weight)),
      score: Math.max(0, Math.round(score)),
      status: ['pass', 'watch', 'fail', 'unknown'].includes(status) ? status : 'unknown',
      evidence,
    };
  };
  const getReportScoreBreakdown = () => {
    const raw = C.reportScoreBreakdown;
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const criteria = ensureArray(raw.criteria)
      .map(normalizeScoreCriterion)
      .filter(Boolean);
    const totalCandidate = parseFlexibleNumber(raw.total);
    const total = Number.isFinite(totalCandidate) ? Math.round(totalCandidate) : null;
    const notes = ensureArray(raw.notes).filter(note => typeof note === 'string' && note.trim() !== '');
    const modelFromRoot = typeof C.reportScoreModel === 'string' ? C.reportScoreModel.trim() : '';
    const modelFromBreakdown = typeof raw.model === 'string' ? raw.model.trim() : '';
    const model = modelFromRoot || modelFromBreakdown;

    if (criteria.length === 0 && !Number.isFinite(total)) {
      return null;
    }

    return {
      model,
      total,
      criteria,
      notes,
    };
  };
  const verdictFromScore = score => {
    if (!Number.isFinite(score)) return null;
    if (score >= 80) return 'STRONG BUY';
    if (score >= 65) return 'BUY';
    if (score >= 50) return 'HOLD';
    if (score >= 35) return 'REDUCE';
    return 'SELL';
  };
  const reportToneFromVerdict = verdict => {
    if (typeof verdict !== 'string') return { valueClass: '', changeDir: 'down' };
    if (verdict.includes('BUY')) return { valueClass: 'green', changeDir: 'up' };
    if (verdict === 'HOLD') return { valueClass: 'orange', changeDir: 'neutral' };
    return { valueClass: 'red', changeDir: 'down' };
  };
  const getAnalystReportSections = () => {
    const raw = isObject(C.analystReports) ? C.analystReports : null;
    const toSection = key => {
      const list = ensureArray(raw ? raw[key] : null)
        .map(item => {
          if (!isObject(item)) {
            return null;
          }

          const title = ensureSummary(item.title);
          const source = ensureSummary(item.source);
          const link = ensureSummary(item.link);
          if (!title || !source || !link) {
            return null;
          }

          const publishedDate = ensureSummary(item.publishedDate);
          const summary = ensureSummary(item.summary);
          const keyPoints = ensureArray(item.keyPoints)
            .map(item => ensureSummary(item))
            .filter(Boolean)
            .slice(0, 3);

          return {
            title,
            source,
            link,
            publishedDate: publishedDate || null,
            summary,
            keyPoints,
          };
        })
        .filter(Boolean);

      return list;
    };

    const domestic = toSection('domestic');
    const international = toSection('international');
    return {
      hasReports: domestic.length > 0 || international.length > 0,
      domestic,
      international,
    };
  };
  const renderAnalystReportsSection = reportData => {
    const section = document.getElementById('analyst-reports');
    const listEl = document.getElementById('analyst-reports-list');
    if (!section || !listEl) {
      return;
    }

    if (!reportData || !reportData.hasReports) {
      section.style.display = 'none';
      return;
    }

    const renderReportItems = (items, prefix) => {
      if (items.length === 0) {
        return '';
      }

      const itemsHtml = items.map(item => {
        const linkLabel = escapeHtml(item.link);
        const safeLink = isReportUrl(item.link)
          ? `<a class="analyst-report-title" href="${linkLabel}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>`
          : `<span class="analyst-report-title" aria-disabled="true">${escapeHtml(item.title)}</span>`;

        const publishedLabel = item.publishedDate
          ? `<div class="analyst-report-meta">${escapeHtml(item.source)} · ${escapeHtml(item.publishedDate)}</div>`
          : `<div class="analyst-report-meta">${escapeHtml(item.source)}</div>`;

        const summaryHtml = item.summary
          ? `<div class="analyst-report-summary">${escapeHtml(item.summary)}</div>`
          : '';
        const keyPoints = item.keyPoints.length > 0
          ? `<ul class="analyst-report-points">${item.keyPoints.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>`
          : '';
        return `
          <li class="analyst-report-item">
            ${safeLink}
            ${publishedLabel}
            ${summaryHtml}
            ${keyPoints}
          </li>
        `;
      }).join('');

      return `
        <div class="analyst-report-group">
          <div class="analyst-report-group-title">${escapeHtml(prefix)}</div>
          <ul class="analyst-report-list">${itemsHtml}</ul>
        </div>
      `;
    };

    const domesticHtml = renderReportItems(reportData.domestic, '국내 애널리스트');
    const internationalHtml = renderReportItems(reportData.international, '해외 애널리스트');
    const combined = `${domesticHtml}${internationalHtml}`.trim();
    listEl.innerHTML = combined || '<p class="report-empty">연결된 애널리스트 리포트가 없습니다.</p>';
  };

  // ── Nav ──
  document.getElementById('nav-ticker').textContent = C.ticker;
  const navLinks = document.getElementById('nav-links');
  const analystReportSections = getAnalystReportSections();
  const navSections = ensureArray(C.navSections).slice();
  if (analystReportSections.hasReports && !navSections.some(item => item && item.id === 'analyst-reports')) {
    const verdictIndex = navSections.findIndex(item => item && item.id === 'verdict');
    const insertIndex = verdictIndex >= 0 ? verdictIndex : navSections.length;
    navSections.splice(insertIndex, 0, { id: 'analyst-reports', label: '애널리스트 리포트' });
  }

  navSections.forEach(s => {
    const a = document.createElement('a');
    a.href = '#' + s.id; a.textContent = s.label;
    navLinks.appendChild(a);
  });

  // ── Hero ──
  document.getElementById('hero-date').textContent = `${C.analysisDate} Report`;
  document.getElementById('hero-title').innerHTML = `${C.companyNameEn}<br>${C.companyName}`;
  document.getElementById('hero-sub').innerHTML = `${C.exchange}: ${C.ticker} — ${C.description}`;
  document.title = `${C.ticker} — 종합 분석 리포트`;

  const reportScoreBreakdown = getReportScoreBreakdown();
  const reportScore = Number.isFinite(reportScoreBreakdown && reportScoreBreakdown.total)
    ? Math.round(reportScoreBreakdown.total)
    : Number.isFinite(C.reportScore)
      ? Math.round(C.reportScore)
      : deriveReportScoreFromRadar();
  const reportVerdict = typeof C.reportVerdict === 'string' && C.reportVerdict.trim()
    ? C.reportVerdict.trim().toUpperCase()
    : verdictFromScore(reportScore);
  const reportTone = reportToneFromVerdict(reportVerdict);

  const statsData = [
    {label:'현재 주가', value: C.price, change: C.priceChange, dir: C.priceChangeDir},
    {label:'시가총액', value: C.marketCap, change: C.marketCapChange, dir:'up'},
    {label:'1년 범위', value: C.weekRange, valueStyle:'font-size:1.15rem'},
    {label:'애널리스트', value: C.analystRating, valueClass:'green', change: C.analystTarget, dir:'up'},
    {
      label:'리포트 점수',
      value: Number.isFinite(reportScore) ? `${reportScore}점` : '-',
      valueClass: reportTone.valueClass,
      change: reportVerdict ? `AI 결론 ${reportVerdict}` : 'AI 결론 산출 필요',
      dir: reportTone.changeDir,
    },
  ];
  const heroStats = document.getElementById('hero-stats');
  statsData.forEach((s,i) => {
    heroStats.innerHTML += `<div class="stat-card fade-in delay-${i+1}">
      <div class="stat-label">${s.label}</div>
      <div class="stat-value ${s.valueClass||''}" ${s.valueStyle?`style="${s.valueStyle}"`:''}>${s.value}</div>
      ${s.change ? `<div class="stat-change ${s.dir}">${s.change}</div>` : ''}
    </div>`;
  });

  // ── Key Points ──
  const kpList = document.getElementById('key-points');
  C.keyPoints.forEach(p => { kpList.innerHTML += `<li>${p}</li>`; });
  renderAnalystReportsSection(analystReportSections);

  // ── Segments ──
  const segGrid = document.getElementById('segments-grid');
  C.segments.forEach(s => {
    const colorClass = `card-${s.color}`;
    segGrid.innerHTML += `<div class="card ${colorClass}">
      <div class="card-title">${s.icon} ${s.name} (비중 ${s.backlog})</div>
      <p class="body-text">${s.description}</p>
      <p style="font-size:.82rem;color:var(--green2)">${s.revenue}</p>
    </div>`;
  });

  // ── Moats ──
  const moatsGrid = document.getElementById('moats-grid');
  C.moats.forEach(m => {
    moatsGrid.innerHTML += `<div class="card moat-card"><div class="moat-icon">${m.icon}</div><div class="moat-name">${m.name}</div><div class="moat-desc">${m.desc}</div></div>`;
  });

  // ── Revenue Breakdown (Doughnut) ──
  new Chart(document.getElementById('revenueBreakdownChart'),{
    type:'doughnut',
    data:{labels:C.revenueBreakdown.labels, datasets:[{data:C.revenueBreakdown.data, backgroundColor:C.revenueBreakdown.colors, borderWidth:0, hoverOffset:8}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{font:{size:12}}}}}
  });

  // ── Annual Revenue (Bar) ──
  const annualLabelsRaw = ensureArray(C.annualRevenue && C.annualRevenue.labels);
  const annualDataRaw = ensureNumberArray(C.annualRevenue && C.annualRevenue.data);
  const annualLength = Math.min(annualLabelsRaw.length, annualDataRaw.length);
  if (annualLength > 0) {
    const annualLabels = annualLabelsRaw.slice(0, annualLength);
    const annualData = annualDataRaw.slice(0, annualLength);
    const estIdx = Number.isInteger(C.annualRevenue && C.annualRevenue.estimateStartIndex)
      ? C.annualRevenue.estimateStartIndex
      : annualLength;
    const annualBackground = annualData.map((_, index) =>
      index >= estIdx ? 'rgba(59,130,246,.35)' : '#3b82f6'
    );
    const annualBorders = annualData.map((_, index) =>
      index >= estIdx ? '#3b82f6' : 'transparent'
    );
    const annualBorderWidth = annualData.map((_, index) =>
      index >= estIdx ? 2 : 0
    );

    safeNewChart('revenueChart',{
      type:'bar',
      data:{labels:annualLabels, datasets:[{
        label:'연간 매출', data:annualData,
        backgroundColor: annualBackground,
        borderColor: annualBorders,
        borderWidth: annualBorderWidth,
      }]},
      options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>`$${c.raw}M`}}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>'$'+v+'M'}}}}
    }, '연간 매출 차트를 렌더링하지 못했습니다.');
  } else {
    showChartPlaceholder('revenueChart', '연간 매출 데이터가 없습니다.');
  }

  // ── Quarterly Revenue (Line) ──
  new Chart(document.getElementById('quarterlyChart'),{
    type:'line',
    data:{labels:C.quarterlyRevenue.labels, datasets:[{
      label:'분기 매출', data:C.quarterlyRevenue.data,
      borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,.08)',
      fill:true, tension:.4, pointRadius:5, pointBackgroundColor:'#3b82f6', pointBorderColor:'#0a0e17', pointBorderWidth:2
    }]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>`$${c.raw}M`}}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>'$'+v+'M'}}}}
  });

  // ── Margin Trend (Line) ──
  new Chart(document.getElementById('marginChart'),{
    type:'line',
    data:{labels:C.marginTrend.labels, datasets:[
      {label:'GAAP 순이익률', data:C.marginTrend.gaap, borderColor:'#22c55e', backgroundColor:'rgba(34,197,94,.08)', fill:true, tension:.4, pointRadius:4, pointBackgroundColor:'#22c55e', pointBorderColor:'#0a0e17', pointBorderWidth:2},
      {label:'Non-GAAP (조정)', data:C.marginTrend.nonGaap, borderColor:'#a78bfa', borderDash:[5,5], tension:.4, pointRadius:4, pointBackgroundColor:'#a78bfa', pointBorderColor:'#0a0e17', pointBorderWidth:2},
    ]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{font:{size:11}}}}, scales:{y:{ticks:{callback:v=>v+'%'}}}}
  });

  // ── Financial Table ──
  const ftBody = document.querySelector('#financial-table tbody');
  C.financialTable.forEach(r => {
    ftBody.innerHTML += `<tr><td>${r[0]}</td><td class="mono">${r[1]}</td><td class="mono">${r[2]}</td><td><span class="tag tag-${r[4]}">${r[3]}</span></td><td style="color:var(--text2);font-size:.82rem">${r[5]}</td></tr>`;
  });

  // ── Valuation (Bar) ──
  const valuationLabelsRaw = ensureArray(C.valuation && C.valuation.labels);
  const valuationCompanyRaw = ensureNumberArray(C.valuation && C.valuation.company);
  const valuationIndustryRaw = ensureNumberArray(C.valuation && C.valuation.industry);
  const valuationLength = Math.min(valuationLabelsRaw.length, valuationCompanyRaw.length, valuationIndustryRaw.length);
  if (valuationLength > 0) {
    safeNewChart('valuationChart',{
      type:'bar',
      data:{labels:valuationLabelsRaw.slice(0, valuationLength), datasets:[
        {label:C.ticker, data:valuationCompanyRaw.slice(0, valuationLength), backgroundColor:'#3b82f6'},
        {label:'업종 평균', data:valuationIndustryRaw.slice(0, valuationLength), backgroundColor:'#5e6e8a'},
      ]},
      options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{font:{size:11}}}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>v+'x'}}}}
    }, '밸류에이션 비교 차트를 렌더링하지 못했습니다.');
  } else {
    showChartPlaceholder('valuationChart', '밸류에이션 데이터가 없습니다.');
  }

  // ── Financial Health Bars ──
  const hBars = document.getElementById('health-bars');
  C.financialHealth.forEach(h => {
    hBars.innerHTML += `<div class="comp-row"><div class="comp-label">${h.label}</div><div class="comp-bar-track"><div class="comp-bar" style="width:${h.width};background:linear-gradient(90deg,${h.gradient})">${h.value}</div></div></div>`;
  });
  const hMetrics = document.getElementById('health-metrics');
  const forwardPeg = deriveForwardPeg();
  const psgProxy = derivePsgProxy();
  let pegFallbackNote = '';
  C.healthMetrics.forEach(m => {
    const metricLabel = typeof m.label === 'string' ? m.label : '';
    const metricValue = typeof m.value === 'string' ? m.value : '';
    let label = metricLabel;
    let value = metricValue;
    let color = typeof m.color === 'string' ? m.color : 'var(--text2)';

    if (metricLabel.includes('PEG') && isPegUnavailable(metricValue)) {
      if (forwardPeg && Number.isFinite(forwardPeg.peg)) {
        label = 'PEG (Forward)';
        value = `${forwardPeg.peg.toFixed(2)}x`;
        color = pegColor(forwardPeg.peg);
        if (!pegFallbackNote) {
          const basisSuffix = forwardPeg.basis ? `, ${forwardPeg.basis}` : '';
          pegFallbackNote = `* Forward PEG = Forward P/E(${forwardPeg.forwardPE.toFixed(2)}x) ÷ EPS 성장률(${forwardPeg.epsGrowthPct.toFixed(2)}%${basisSuffix})`;
        }
      } else if (psgProxy && Number.isFinite(psgProxy.proxy)) {
        label = 'PEG 대체(PSG)';
        value = `${psgProxy.proxy.toFixed(2)}x`;
        color = pegColor(psgProxy.proxy);
        if (!pegFallbackNote) {
          pegFallbackNote = `* PEG 계산 불가 시 P/S(${psgProxy.psRatio.toFixed(2)}x) ÷ 매출성장률(${psgProxy.growthPct.toFixed(1)}%, ${psgProxy.fromLabel}→${psgProxy.toLabel})로 대체했습니다.`;
        }
      }
    }

    hMetrics.innerHTML += `<div style="display:flex;justify-content:space-between;margin-bottom:.5rem"><span style="font-size:.78rem;color:var(--text3)">${label}</span><span class="mono" style="font-size:.85rem;color:${color}">${value}</span></div>`;
  });
  if (pegFallbackNote) {
    hMetrics.innerHTML += `<div style="margin-top:.25rem;font-size:.72rem;color:var(--text3)">${pegFallbackNote}</div>`;
  }

  // ── Timeline ──
  const tlEl = document.getElementById('timeline');
  C.timeline.forEach(t => {
    tlEl.innerHTML += `<div class="timeline-item ${t.status}"><div class="timeline-date">${t.date}</div><div class="timeline-text">${t.text}</div></div>`;
  });

  // ── Competitor Chart (Bar) ──
  const competitorTitle = C.competitorChart && typeof C.competitorChart.chartLabel === 'string'
    ? C.competitorChart.chartLabel
    : '경쟁사 비교';
  document.getElementById('comp-chart-title').textContent = competitorTitle;

  const competitorLabelsRaw = ensureArray(C.competitorChart && C.competitorChart.labels);
  const competitorDataRaw = ensureNumberArray(C.competitorChart && C.competitorChart.data);
  const competitorColorsRaw = ensureArray(C.competitorChart && C.competitorChart.colors);
  const competitorLength = Math.min(competitorLabelsRaw.length, competitorDataRaw.length);
  if (competitorLength > 0) {
    const competitorColors = Array.from({ length: competitorLength }, (_, index) =>
      typeof competitorColorsRaw[index] === 'string' ? competitorColorsRaw[index] : '#3b82f6'
    );
    const yLabel = C.competitorChart && typeof C.competitorChart.yLabel === 'string'
      ? C.competitorChart.yLabel
      : '';

    safeNewChart('competitorChart',{
      type:'bar',
      data:{labels:competitorLabelsRaw.slice(0, competitorLength), datasets:[{
        label:competitorTitle,
        data:competitorDataRaw.slice(0, competitorLength),
        backgroundColor:competitorColors,
        borderWidth:0
      }]},
      options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>'$'+v+yLabel}}}}
    }, '시가총액 비교 차트를 렌더링하지 못했습니다.');
  } else {
    showChartPlaceholder('competitorChart', '경쟁사 비교 데이터가 없습니다.');
  }

  // ── Competitor Table ──
  const ctTbl = document.getElementById('competitor-table');
  let ctHTML = '<thead><tr>';
  C.competitorTable.headers.forEach(h => ctHTML += `<th>${h}</th>`);
  ctHTML += '</tr></thead><tbody>';
  C.competitorTable.rows.forEach((r,i) => {
    ctHTML += '<tr>';
    r.forEach((c,j) => {
      const style = i===0 && j===0 ? ' style="font-weight:700;color:var(--accent2)"' : '';
      ctHTML += `<td${style}>${c}</td>`;
    });
    ctHTML += '</tr>';
  });
  ctHTML += '</tbody>';
  ctTbl.innerHTML = ctHTML;

  // ── Risk Warnings ──
  const rwList = document.getElementById('risk-warnings');
  C.risks.warnings.forEach(w => { rwList.innerHTML += `<li>${w}</li>`; });

  // ── Risk Bubble Chart ──
  new Chart(document.getElementById('riskChart'),{
    type:'bubble',
    data:{datasets: C.risks.items.map(r => ({label:r.label, data:[{x:r.x,y:r.y,r:r.r}], backgroundColor:r.bg, borderColor:r.border, borderWidth:2}))},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{font:{size:10.5}}}},
      scales:{x:{title:{display:true,text:'발생 가능성 →',font:{size:11}},min:0,max:10,ticks:{stepSize:2}}, y:{title:{display:true,text:'주가 영향도 →',font:{size:11}},min:0,max:10,ticks:{stepSize:2}}}}
  });

  // ── Bull/Bear Lists ──
  const bullList = document.getElementById('bull-list');
  C.bullCase.forEach(b => { bullList.innerHTML += `<li>${b}</li>`; });
  const bearList = document.getElementById('bear-list');
  C.bearCase.forEach(b => { bearList.innerHTML += `<li>${b}</li>`; });

  // ── Radar Chart ──
  new Chart(document.getElementById('radarChart'),{
    type:'radar',
    data:{labels:C.radar.labels, datasets:[{
      label:C.ticker+' 평가', data:C.radar.data,
      backgroundColor:'rgba(59,130,246,.15)', borderColor:'#3b82f6', borderWidth:2,
      pointBackgroundColor:'#3b82f6', pointBorderColor:'#0a0e17', pointBorderWidth:2, pointRadius:5
    }]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales:{r:{beginAtZero:true,max:10,ticks:{stepSize:2,backdropColor:'transparent',font:{size:10}},grid:{color:'rgba(30,42,66,.6)'},angleLines:{color:'rgba(30,42,66,.6)'},pointLabels:{font:{size:11,weight:'500'},color:'#94a3c0'}}}}
  });

  // ── Report Score Breakdown ──
  const breakdownCard = document.getElementById('score-breakdown-card');
  const breakdownMeta = document.getElementById('score-breakdown-meta');
  const breakdownBody = document.querySelector('#score-breakdown-table tbody');
  const breakdownNotes = document.getElementById('score-breakdown-notes');
  if (breakdownCard && breakdownMeta && breakdownBody && breakdownNotes) {
    if (reportScoreBreakdown && reportScoreBreakdown.criteria.length > 0) {
      const statusTag = status => {
        if (status === 'pass') return "<span class='tag tag-green'>통과</span>";
        if (status === 'watch') return "<span class='tag tag-orange'>관찰</span>";
        if (status === 'fail') return "<span class='tag tag-red'>미달</span>";
        return "<span class='tag tag-blue'>데이터 부족</span>";
      };

      breakdownCard.style.display = 'block';
      const modelLabel = reportScoreBreakdown.model || 'custom';
      const totalLabel = Number.isFinite(reportScore) ? `${reportScore}/100` : '-';
      breakdownMeta.textContent = `모델: ${modelLabel} · 총점: ${totalLabel}`;

      breakdownBody.innerHTML = '';
      reportScoreBreakdown.criteria.forEach(item => {
        breakdownBody.innerHTML += `<tr>
          <td style="font-weight:600">${item.label}</td>
          <td class="mono">${item.score}/${item.weight}</td>
          <td>${statusTag(item.status)}</td>
          <td style="color:var(--text2);font-size:.82rem">${item.evidence || '-'}</td>
        </tr>`;
      });

      breakdownNotes.innerHTML = '';
      reportScoreBreakdown.notes.forEach(note => {
        breakdownNotes.innerHTML += `<li>${note}</li>`;
      });
      breakdownNotes.style.display = reportScoreBreakdown.notes.length > 0 ? 'block' : 'none';
    } else {
      breakdownCard.style.display = 'none';
      breakdownBody.innerHTML = '';
      breakdownNotes.innerHTML = '';
    }
  }

  // ── Checklist Table ──
  const clBody = document.querySelector('#checklist-table tbody');
  C.checklist.forEach(r => {
    clBody.innerHTML += `<tr><td style="font-weight:600">${r[0]}</td><td class="mono">${r[1]}</td><td style="color:var(--text2);font-size:.82rem">${r[2]}</td></tr>`;
  });

  // ── Disclaimer ──
  document.getElementById('disclaimer').innerHTML = `본 보고서는 투자 참고용으로 작성되었으며, 특정 주식의 매수 또는 매도를 권유하는 것이 아닙니다.<br>모든 투자 결정은 본인의 판단과 책임 하에 이루어져야 하며, 투자에는 원금 손실의 위험이 존재합니다.<br>데이터 기준일: ${C.analysisDate} · 공개된 자료에 기반합니다.`;

  // ── Scroll Animations ──
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if(e.isIntersecting){ e.target.style.opacity='1'; e.target.style.transform='translateY(0)'; }});
  },{threshold:0.1});
  document.querySelectorAll('.section,.card').forEach(el => {
    el.style.opacity='0'; el.style.transform='translateY(16px)';
    el.style.transition='opacity .5s,transform .5s';
    observer.observe(el);
  });
  // Fallback: if observer timing fails, force visible so charts are never hidden.
  window.setTimeout(() => {
    document.querySelectorAll('.section,.card').forEach(el => {
      if (el.style.opacity === '0') {
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }
    });
  }, 1200);

  // ── Active Nav Link ──
  const sections = document.querySelectorAll('.section[id], .hero[id]');
  const navAs = document.querySelectorAll('.nav-links a');
  window.addEventListener('scroll',()=>{
    let current='';
    sections.forEach(s=>{if(window.scrollY >= s.offsetTop - 100) current=s.id;});
    navAs.forEach(a=>{a.classList.toggle('active',a.getAttribute('href')==='#'+current);});
  });
}
