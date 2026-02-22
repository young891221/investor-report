(function () {
  const grid = document.getElementById('stocks');
  const filterWrap = document.getElementById('sector-filters');
  const searchInput = document.getElementById('stock-search');
  const statsWrap = document.getElementById('portfolio-stats');
  const viewToggle = document.getElementById('view-toggle');

  let currentView = 'grid';

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function detectChangeDir(report) {
    const value = String(report.change || report.priceChange || '');
    if (report.changeDir === 'up' || report.changeDir === 'down') {
      return report.changeDir;
    }
    return /^[-▼]/.test(value) ? 'down' : 'up';
  }

  function getDisplayChange(report) {
    if (report.change) {
      return report.change;
    }
    if (report.marketCapChange) {
      return String(report.marketCapChange).replace(/\s*\([^)]*\)\s*$/u, '');
    }
    return report.priceChange || '-';
  }

  function formatReportScore(rawScore) {
    return Number.isFinite(Number(rawScore)) ? `${Math.round(Number(rawScore))}` : '-';
  }

  function getScoreClass(rawScore) {
    const score = Number(rawScore);
    if (!Number.isFinite(score)) {
      return '';
    }
    if (score >= 80) {
      return 'score-good';
    }
    if (score >= 65) {
      return 'score-neutral';
    }
    if (score >= 50) {
      return 'score-warning';
    }
    return 'score-bad';
  }

  function getRatingClass(rawRating) {
    const rating = String(rawRating || '').toUpperCase().trim();

    if (!rating) {
      return 'rating-neutral';
    }

    if (/(BUY|OVERWEIGHT|매수|강력.*매수|STRONG)/u.test(rating)) {
      return 'rating-buy';
    }

    if (/(HOLD|NEUTRAL|중립|보유|평가)/u.test(rating)) {
      return 'rating-hold';
    }

    if (/(SELL|REDUCE|UNDERPERFORM|UNDERWEIGHT|매도|다운|부정)/u.test(rating)) {
      return 'rating-sell';
    }

    return 'rating-neutral';
  }

  function getAnalysisAiClass(rawAnalysisAi) {
    const value = String(rawAnalysisAi || '').trim().toUpperCase();

    if (value === 'GPT') {
      return 'analysis-ai-gpt';
    }

    if (!value) {
      return 'analysis-ai-empty';
    }

    return 'analysis-ai';
  }

  function buildReportHref(ticker, date, rawHref) {
    if (typeof rawHref === 'string' && rawHref.trim() !== '') {
      return rawHref;
    }

    if (ticker && date) {
      return `stock.html?ticker=${encodeURIComponent(ticker)}&date=${encodeURIComponent(date)}`;
    }

    if (ticker) {
      return `stock.html?ticker=${encodeURIComponent(ticker)}`;
    }

    return '#';
  }

  function formatDisplayDate(dateText) {
    const date = String(dateText || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date.replace(/-/g, '.');
    }
    return date || '-';
  }

  function renderReportLinks(ticker, reports) {
    if (!Array.isArray(reports) || reports.length === 0) {
      return `<div class="stock-report-empty">리포트 이력이 없습니다.</div>`;
    }

    return reports
      .map(report => {
        const date = String(report.date || '').trim();
        const href = buildReportHref(ticker, date, report.href);
        const reportLabel = formatDisplayDate(date);
        const score = formatReportScore(report.score);
        const ratingClass = getRatingClass(report.rating);
        const scoreClass = getScoreClass(report.score);
        const analysisAi = report.analysisAi || '-';
        const analysisAiClass = getAnalysisAiClass(analysisAi);

        return `
          <a class="stock-report-link" href="${escapeHtml(href)}">
            <span class="stock-report-date">${escapeHtml(reportLabel)} Report</span>
            <span class="stock-report-rating ${escapeHtml(ratingClass)}">${escapeHtml(report.rating || '-')}</span>
            <span class="stock-report-score ${escapeHtml(scoreClass)}">${escapeHtml(score)}</span>
            <span class="stock-report-ai ${escapeHtml(analysisAiClass)}">${escapeHtml(analysisAi)}</span>
            <span class="stock-report-change">${escapeHtml(report.change || '-')}</span>
          </a>
        `;
      })
      .join('');
  }

  function normalizeReport(ticker, raw, fallbackDate) {
    const date = String(raw && (raw.date || raw.analysisDate || fallbackDate) || '').trim();

    return {
      date,
      price: raw && raw.price ? raw.price : '-',
      change: getDisplayChange(raw || {}),
      changeDir: detectChangeDir(raw || {}),
      changeBasis: raw && raw.changeBasis ? raw.changeBasis : '기준',
      rating: raw && (raw.rating || raw.analystRating) ? raw.rating || raw.analystRating : '-',
      score: raw && Object.prototype.hasOwnProperty.call(raw, 'reportScore') ? raw.reportScore : '-',
      analysisAi: raw && Object.prototype.hasOwnProperty.call(raw, 'analysisAi') ? raw.analysisAi : '-',
      href: buildReportHref(ticker, date, raw && raw.href),
    };
  }

  function normalizeStock(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.ticker !== 'string') {
      return null;
    }

    const ticker = raw.ticker.trim().toUpperCase();
    const reports = [];

    if (Array.isArray(raw.reports)) {
      raw.reports.forEach(report => {
        reports.push(normalizeReport(ticker, report, ''));
      });
    }

    if (reports.length === 0) {
      reports.push(normalizeReport(ticker, raw, raw.analysisDate || raw.date || ''));
    }

    reports.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const latest = raw.latest && typeof raw.latest === 'object'
      ? normalizeReport(ticker, raw.latest, reports[0] ? reports[0].date : '')
      : reports[0];

    const latestDate = latest && latest.date;
    if (latestDate && !reports.some(report => report.date === latestDate)) {
      reports.unshift(latest);
      reports.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }

    return {
      ticker,
      name: raw.name || raw.companyNameEn || '-',
      nameKr: raw.nameKr || raw.companyName || '-',
      sector: raw.sector || '',
      description: raw.description || '',
      tags: Array.isArray(raw.tags) ? raw.tags : [],
      reports,
      latest: reports[0] || latest,
    };
  }

  function matchesSearch(stock, query) {
    if (!query) {
      return true;
    }

    const q = String(query).trim().toLowerCase();
    if (!q) {
      return true;
    }

    const rating = stock && stock.latest ? stock.latest.rating : '';
    const fields = [
      stock.ticker,
      stock.name,
      stock.nameKr,
      stock.sector,
      stock.description,
      ...(Array.isArray(stock.tags) ? stock.tags : []),
      rating,
    ].map(value => String(value || '').toLowerCase());

    return fields.some(value => value.includes(q));
  }

  function filterStocks(stocks, sector, query) {
    return stocks.filter(stock => {
      const matchSector = sector === '전체' || stock.sector === sector;
      const matchSearch = matchesSearch(stock, query);
      return matchSector && matchSearch;
    });
  }

  function createSectorFilters(stocks, onSelect) {
    const sectors = [...new Set(stocks.map(stock => stock.sector).filter(Boolean))].sort();
    const labels = ['전체', ...sectors];

    let active = '전체';
    filterWrap.innerHTML = '';

    labels.forEach(label => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stock-card-tag';
      button.style.cursor = 'pointer';
      button.style.padding = '6px 14px';
      button.style.borderRadius = '999px';
      button.style.fontSize = '.75rem';
      button.style.background = label === active ? 'var(--accent-glow)' : 'var(--bg3)';
      button.style.color = label === active ? 'var(--accent2)' : 'var(--text2)';
      button.style.borderColor = label === active ? 'var(--accent)' : 'var(--border)';
      button.textContent = label;

      button.addEventListener('click', () => {
        active = label;
        [...filterWrap.children].forEach(chip => {
          const selected = chip.textContent === active;
          chip.style.background = selected ? 'var(--accent-glow)' : 'var(--bg3)';
          chip.style.color = selected ? 'var(--accent2)' : 'var(--text2)';
          chip.style.borderColor = selected ? 'var(--accent)' : 'var(--border)';
        });
        onSelect(label);
      });

      filterWrap.appendChild(button);
    });
  }

  /* ── Portfolio Stats ── */

  function renderPortfolioStats(stocks) {
    if (!statsWrap || stocks.length === 0) {
      if (statsWrap) statsWrap.innerHTML = '';
      return;
    }

    const totalStocks = stocks.length;

    let buyCount = 0;
    let holdCount = 0;
    let sellCount = 0;
    let scoreSum = 0;
    let scoreCount = 0;

    stocks.forEach(stock => {
      const rating = getRatingClass(stock.latest && stock.latest.rating);
      if (rating === 'rating-buy') buyCount++;
      else if (rating === 'rating-hold') holdCount++;
      else if (rating === 'rating-sell') sellCount++;

      const score = Number(stock.latest && stock.latest.score);
      if (Number.isFinite(score)) {
        scoreSum += score;
        scoreCount++;
      }
    });

    const avgScore = scoreCount > 0 ? Math.round(scoreSum / scoreCount) : '-';

    statsWrap.innerHTML = `
      <div class="pf-stat">
        <div class="pf-stat-value accent">${totalStocks}</div>
        <div class="pf-stat-label">Total Stocks</div>
      </div>
      <div class="pf-stat">
        <div class="pf-stat-value green">${buyCount}</div>
        <div class="pf-stat-label">Buy</div>
      </div>
      <div class="pf-stat">
        <div class="pf-stat-value orange">${holdCount}</div>
        <div class="pf-stat-label">Hold</div>
      </div>
      <div class="pf-stat">
        <div class="pf-stat-value">${avgScore}</div>
        <div class="pf-stat-label">Avg Score</div>
      </div>
    `;
  }

  /* ── Card Grid View ── */

  function renderCardGrid(stocks) {
    grid.innerHTML = '';
    grid.className = 'stock-grid stock-grid--card';

    if (stocks.length === 0) {
      grid.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text3);grid-column:1/-1">조건에 맞는 종목이 없습니다.</div>';
      return;
    }

    stocks.forEach((stock, idx) => {
      const latest = stock.latest || {};
      const tags = Array.isArray(stock.tags) ? stock.tags : [];
      const hasReportHistory = Array.isArray(stock.reports) && stock.reports.length > 0;

      const changeText = getDisplayChange(latest);
      const changeDir = detectChangeDir(latest);
      const ratingClass = getRatingClass(latest.rating);
      const scoreClass = getScoreClass(latest.score);
      const scoreNum = Number(latest.score);
      const scoreDisplay = formatReportScore(latest.score);
      const scoreWidth = Number.isFinite(scoreNum) ? Math.min(scoreNum, 100) : 0;
      const analysisAiClass = getAnalysisAiClass(latest.analysisAi);

      const card = document.createElement('article');
      card.className = 'pf-card fade-in';
      card.style.animationDelay = `${idx * 0.06}s`;
      card.tabIndex = 0;
      card.setAttribute('aria-expanded', 'false');
      card.dataset.open = 'false';

      const listHtml = renderReportLinks(stock.ticker, stock.reports);

      card.innerHTML = `
        <div class="pf-card-head">
          <span class="pf-card-ticker">${escapeHtml(stock.ticker)}</span>
          <span class="pf-card-rating ${escapeHtml(ratingClass)}">${escapeHtml(latest.rating || '-')}</span>
        </div>
        <div class="pf-card-name">${escapeHtml(stock.name || '-')} · ${escapeHtml(stock.nameKr || '-')}</div>
        <div class="pf-card-price-row">
          <span class="pf-card-price">${escapeHtml(latest.price || '-')}</span>
          <span class="pf-card-change ${escapeHtml(changeDir)}">${escapeHtml(changeText)}</span>
        </div>
        <div class="pf-card-score-wrap">
          <div class="pf-card-score-header">
            <span class="pf-card-score-label">100x Score</span>
            <span class="pf-card-score-value ${escapeHtml(scoreClass)}">${escapeHtml(scoreDisplay)}</span>
          </div>
          <div class="pf-card-score-track">
            <div class="pf-card-score-bar ${escapeHtml(scoreClass)}" style="width:${scoreWidth}%"></div>
          </div>
        </div>
        <div class="pf-card-tags">
          ${tags.slice(0, 3).map(tag => `<span class="pf-card-tag">${escapeHtml(tag)}</span>`).join('')}
          <span class="pf-card-tag ${escapeHtml(analysisAiClass)}">${escapeHtml(latest.analysisAi || '-')}</span>
        </div>
        ${stock.description ? `<p class="pf-card-desc">${escapeHtml(stock.description)}</p>` : ''}
        <div class="pf-card-footer">
          <span class="pf-card-date">${escapeHtml(formatDisplayDate(latest.date || '-'))}</span>
          <span class="pf-card-arrow">${hasReportHistory ? '&#9656;' : '&#8212;'}</span>
        </div>
        ${hasReportHistory ? `<div class="pf-card-reports" hidden>${listHtml}</div>` : ''}
      `;

      const reportList = card.querySelector('.pf-card-reports');
      const toggleCard = event => {
        if (!hasReportHistory || !reportList) return;
        if (event && event.target && event.target.closest('.stock-report-link')) return;

        const isOpen = card.dataset.open === 'true';
        const nextOpen = !isOpen;
        card.dataset.open = nextOpen ? 'true' : 'false';
        card.setAttribute('aria-expanded', String(nextOpen));
        reportList.hidden = !nextOpen;
      };

      card.addEventListener('click', toggleCard);
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleCard(event);
        }
      });

      grid.appendChild(card);
    });
  }

  /* ── List View ── */

  function renderListView(stocks) {
    grid.innerHTML = '';
    grid.className = 'stock-grid stock-grid--list';

    if (stocks.length === 0) {
      grid.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text3)">조건에 맞는 종목이 없습니다.</div>';
      return;
    }

    stocks.forEach((stock, idx) => {
      const tags = Array.isArray(stock.tags) ? stock.tags : [];
      const latest = stock.latest || {};
      const hasReportHistory = Array.isArray(stock.reports) && stock.reports.length > 0;
      const reportListId = `stock-reports-${stock.ticker.toLowerCase()}-${idx}`;

      const card = document.createElement('article');
      card.className = 'stock-list-item fade-in';
      card.style.animationDelay = `${idx * 0.08}s`;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-expanded', 'false');
      card.dataset.open = 'false';

      const changeText = getDisplayChange(latest);
      const latestDate = latest.date || '-';
      const changeDir = detectChangeDir(latest);
      const listHtml = renderReportLinks(stock.ticker, stock.reports);

      card.innerHTML = `
        <div class="stock-list-head">
          <div>
            <div class="stock-list-ticker">${escapeHtml(stock.ticker)}</div>
            <div class="stock-list-name">${escapeHtml(stock.name || '-')} · ${escapeHtml(stock.nameKr || '-')}</div>
          </div>
          <div class="stock-list-latest">
            <div class="stock-list-latest-date">${escapeHtml(formatDisplayDate(latestDate))}</div>
            <div class="stat-change ${escapeHtml(changeDir)}" style="font-size:.72rem">${escapeHtml(changeText)}</div>
          </div>
          <div class="stock-list-arrow ${hasReportHistory ? '' : 'disabled'}">${hasReportHistory ? '&#9656;' : '&#8212;'}</div>
        </div>
        ${hasReportHistory ? `<div class="stock-date-list" id="${escapeHtml(reportListId)}" hidden>${listHtml}</div>` : ''}
        <div class="stock-list-tag-row">
          <span class="stock-card-tag">${escapeHtml(formatDisplayDate(latest.date || '-'))}</span>
          ${tags.map(tag => `<span class="stock-card-tag">${escapeHtml(tag)}</span>`).join('')}
          <span class="stock-card-tag ${escapeHtml(getRatingClass(latest.rating))}">${escapeHtml(latest.rating || '-')}</span>
          <span class="stock-card-tag ${escapeHtml(getScoreClass(latest.score))}">${escapeHtml(`100배 주식 점수 ${formatReportScore(latest.score)}점`)}</span>
          <span class="stock-card-tag ${escapeHtml(getAnalysisAiClass(latest.analysisAi))}">${escapeHtml(latest.analysisAi || '-')}</span>
        </div>
        ${stock.description ? `<p class="stock-list-desc">${escapeHtml(stock.description || '')}</p>` : ''}
      `;

      const reportList = card.querySelector('.stock-date-list');
      const arrow = card.querySelector('.stock-list-arrow');
      const toggleCard = event => {
        if (!hasReportHistory || !reportList) return;
        if (event && event.target && event.target.closest('.stock-report-link')) return;
        if (event && event.target && event.target.closest('.stock-list-arrow')) return;

        const isOpen = card.dataset.open === 'true';
        const nextOpen = !isOpen;
        card.dataset.open = nextOpen ? 'true' : 'false';
        card.setAttribute('aria-expanded', String(nextOpen));
        reportList.hidden = !nextOpen;
      };

      card.addEventListener('click', toggleCard);
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleCard(event);
        }
      });

      grid.appendChild(card);
    });
  }

  /* ── Render dispatcher ── */

  function renderCards(stocks) {
    if (currentView === 'grid') {
      renderCardGrid(stocks);
    } else {
      renderListView(stocks);
    }
  }

  function renderNoResultMessage(term) {
    const safeTerm = escapeHtml(String(term || '').trim());
    const message = safeTerm
      ? `${safeTerm} 검색 결과가 없습니다.`
      : '조건에 맞는 종목이 없습니다.';
    grid.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--text3)">${escapeHtml(message)}</div>`;
  }

  function normalizeStocks(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .map(normalizeStock)
      .filter(Boolean)
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  }

  function showError(message) {
    grid.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--red2)">${escapeHtml(message)}</div>`;
  }

  /* ── View Toggle ── */

  function setupViewToggle(updateList) {
    if (!viewToggle) return;

    viewToggle.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if (view === currentView) return;

        currentView = view;
        viewToggle.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateList();
      });
    });
  }

  /* ── Bootstrap ── */

  async function bootstrap() {
    try {
      const response = await fetch('data/index.json');
      if (!response.ok) {
        throw new Error(`종목 목록을 불러오지 못했습니다 (${response.status})`);
      }

      const stocks = normalizeStocks(await response.json());
      if (stocks.length === 0) {
        renderCards([]);
        return;
      }

      renderPortfolioStats(stocks);

      let selectedSector = '전체';
      let searchTerm = '';
      const getFilteredStocks = () => filterStocks(stocks, selectedSector, searchTerm);

      const updateList = () => {
        const filtered = getFilteredStocks();
        if (filtered.length === 0) {
          renderNoResultMessage(searchTerm);
          return;
        }
        renderCards(filtered);
      };

      if (searchInput) {
        searchInput.addEventListener('input', event => {
          searchTerm = String(event && event.target ? event.target.value : '').trim();
          updateList();
        });
      }

      createSectorFilters(stocks, sector => {
        selectedSector = sector;
        updateList();
      });

      setupViewToggle(updateList);
      updateList();
    } catch (error) {
      showError(error.message);
    }
  }

  bootstrap();
})();
