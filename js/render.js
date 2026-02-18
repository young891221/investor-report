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
  Chart.defaults.scale.grid = {color:'rgba(30,42,66,.5)',drawBorder:false};

  const C = CONFIG;

  // ── Nav ──
  document.getElementById('nav-ticker').textContent = C.ticker;
  const navLinks = document.getElementById('nav-links');
  C.navSections.forEach(s => {
    const a = document.createElement('a');
    a.href = '#' + s.id; a.textContent = s.label;
    navLinks.appendChild(a);
  });

  // ── Hero ──
  document.getElementById('hero-date').textContent = `실시간 분석 · ${C.analysisDate}`;
  document.getElementById('hero-title').innerHTML = `${C.companyNameEn}<br>${C.companyName}`;
  document.getElementById('hero-sub').innerHTML = `${C.exchange}: ${C.ticker} — ${C.description}`;
  document.title = `${C.ticker} — 종합 분석 리포트`;

  const statsData = [
    {label:'현재 주가', value: C.price, change: C.priceChange, dir: C.priceChangeDir},
    {label:'시가총액', value: C.marketCap, change: C.marketCapChange, dir:'up'},
    {label:'52주 범위', value: C.weekRange, valueStyle:'font-size:1.15rem'},
    {label:'애널리스트', value: C.analystRating, valueClass:'green', change: C.analystTarget, dir:'up'},
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
  const estIdx = C.annualRevenue.estimateStartIndex;
  new Chart(document.getElementById('revenueChart'),{
    type:'bar',
    data:{labels:C.annualRevenue.labels, datasets:[{
      label:'연간 매출', data:C.annualRevenue.data,
      backgroundColor: ctx => ctx.dataIndex >= estIdx ? 'rgba(59,130,246,.35)' : '#3b82f6',
      borderColor: ctx => ctx.dataIndex >= estIdx ? '#3b82f6' : 'transparent',
      borderWidth: ctx => ctx.dataIndex >= estIdx ? 2 : 0,
    }]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>`$${c.raw}M`}}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>'$'+v+'M'}}}}
  });

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
  new Chart(document.getElementById('valuationChart'),{
    type:'bar',
    data:{labels:C.valuation.labels, datasets:[
      {label:C.ticker, data:C.valuation.company, backgroundColor:'#3b82f6'},
      {label:'업종 평균', data:C.valuation.industry, backgroundColor:'#5e6e8a'},
    ]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{font:{size:11}}}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>v+'x'}}}}
  });

  // ── Financial Health Bars ──
  const hBars = document.getElementById('health-bars');
  C.financialHealth.forEach(h => {
    hBars.innerHTML += `<div class="comp-row"><div class="comp-label">${h.label}</div><div class="comp-bar-track"><div class="comp-bar" style="width:${h.width};background:linear-gradient(90deg,${h.gradient})">${h.value}</div></div></div>`;
  });
  const hMetrics = document.getElementById('health-metrics');
  C.healthMetrics.forEach(m => {
    hMetrics.innerHTML += `<div style="display:flex;justify-content:space-between;margin-bottom:.5rem"><span style="font-size:.78rem;color:var(--text3)">${m.label}</span><span class="mono" style="font-size:.85rem;color:${m.color}">${m.value}</span></div>`;
  });

  // ── Timeline ──
  const tlEl = document.getElementById('timeline');
  C.timeline.forEach(t => {
    tlEl.innerHTML += `<div class="timeline-item ${t.status}"><div class="timeline-date">${t.date}</div><div class="timeline-text">${t.text}</div></div>`;
  });

  // ── Competitor Chart (Bar) ──
  document.getElementById('comp-chart-title').textContent = C.competitorChart.chartLabel;
  new Chart(document.getElementById('competitorChart'),{
    type:'bar',
    data:{labels:C.competitorChart.labels, datasets:[{label:C.competitorChart.chartLabel, data:C.competitorChart.data, backgroundColor:C.competitorChart.colors, borderWidth:0}]},
    options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>'$'+v+C.competitorChart.yLabel}}}}
  });

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

  // ── Active Nav Link ──
  const sections = document.querySelectorAll('.section[id], .hero[id]');
  const navAs = document.querySelectorAll('.nav-links a');
  window.addEventListener('scroll',()=>{
    let current='';
    sections.forEach(s=>{if(window.scrollY >= s.offsetTop - 100) current=s.id;});
    navAs.forEach(a=>{a.classList.toggle('active',a.getAttribute('href')==='#'+current);});
  });
}
