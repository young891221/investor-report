(function () {
  const grid = document.getElementById('stocks');
  const filterWrap = document.getElementById('sector-filters');

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
    return Number.isFinite(Number(rawScore)) ? `${Math.round(Number(rawScore))}점` : '-';
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

    if (/(SELL|REDUCE|UNDERPERFORM|UNDERWEIGHT|매도|매도|다운|부정)/u.test(rating)) {
      return 'rating-sell';
    }

    return 'rating-neutral';
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

        return `
          <a class="stock-report-link" href="${escapeHtml(href)}">
            <span class="stock-report-date">${escapeHtml(reportLabel)} Report</span>
            <span class="stock-report-rating ${escapeHtml(ratingClass)}">${escapeHtml(report.rating || '-')}</span>
            <span class="stock-report-score ${escapeHtml(scoreClass)}">${escapeHtml(score)}</span>
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

  function renderCards(stocks) {
    grid.innerHTML = '';

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
          <div class="stock-list-arrow ${hasReportHistory ? '' : 'disabled'}">${hasReportHistory ? '▸' : '—'}</div>
        </div>
        ${hasReportHistory ? `<div class="stock-date-list" id="${escapeHtml(reportListId)}" hidden>${listHtml}</div>` : ''}
        <div class="stock-list-tag-row">
          <span class="stock-card-tag">${escapeHtml(formatDisplayDate(latest.date || '-'))}</span>
          ${tags.map(tag => `<span class="stock-card-tag">${escapeHtml(tag)}</span>`).join('')}
          <span class="stock-card-tag ${escapeHtml(getRatingClass(latest.rating))}">${escapeHtml(latest.rating || '-')}</span>
          <span class="stock-card-tag ${escapeHtml(getScoreClass(latest.score))}">${escapeHtml(`100배 주식 점수 ${formatReportScore(latest.score)}`)}</span>
        </div>
        ${stock.description ? `<p class="stock-list-desc">${escapeHtml(stock.description || '')}</p>` : ''}
      `;

      const reportList = card.querySelector('.stock-date-list');
      const arrow = card.querySelector('.stock-list-arrow');
      const toggleCard = event => {
        if (!hasReportHistory || !reportList) {
          return;
        }

        if (event && event.target && event.target.closest('.stock-report-link')) {
          return;
        }
        if (event && event.target && event.target.closest('.stock-list-arrow')) {
          return;
        }

        const isOpen = card.dataset.open === 'true';
        const nextOpen = !isOpen;
        card.dataset.open = nextOpen ? 'true' : 'false';
        card.setAttribute('aria-expanded', String(nextOpen));
        reportList.hidden = !nextOpen;
        if (arrow && nextOpen) {
          arrow.classList.remove('disabled');
        } else if (arrow) {
          arrow.classList.remove('disabled');
        }
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

      let selectedSector = '전체';
      createSectorFilters(stocks, sector => {
        selectedSector = sector;
        const filtered = selectedSector === '전체'
          ? stocks
          : stocks.filter(stock => stock.sector === selectedSector);
        renderCards(filtered);
      });

      const initial = selectedSector === '전체'
        ? stocks
        : stocks.filter(stock => stock.sector === selectedSector);
      renderCards(initial);
    } catch (error) {
      showError(error.message);
    }
  }

  bootstrap();
})();
