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

  function detectChangeDir(stock) {
    const value = String(stock.change || stock.priceChange || '');
    if (stock.changeDir === 'up' || stock.changeDir === 'down') {
      return stock.changeDir;
    }
    return /^[-▼]/.test(value) ? 'down' : 'up';
  }

  function getDisplayChange(stock) {
    if (stock.change) {
      return stock.change;
    }
    if (stock.marketCapChange) {
      return String(stock.marketCapChange).replace(/\s*\([^)]*\)\s*$/u, '');
    }
    return stock.priceChange || '-';
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
      const card = document.createElement('a');
      card.href = `stock.html?ticker=${encodeURIComponent(stock.ticker)}`;
      card.className = 'stock-card fade-in';
      card.style.animationDelay = `${idx * 0.08}s`;

      const changeText = getDisplayChange(stock);
      const changeBasis = stock.changeBasis || '기준';
      const changeDir = detectChangeDir(stock);
      const date = stock.analysisDate || stock.date || '-';

      card.innerHTML = `
        <div class="stock-card-header">
          <div>
            <div class="stock-card-ticker">${escapeHtml(stock.ticker)}</div>
            <div class="stock-card-name">${escapeHtml(stock.name || '-')} · ${escapeHtml(stock.nameKr || '-')}</div>
          </div>
          <div class="stock-card-price">
            <div class="stock-card-price-val">${escapeHtml(stock.price || '-')}</div>
            <div class="stat-change ${escapeHtml(changeDir)}" style="text-align:right;font-size:.75rem">${escapeHtml(changeText)} (${escapeHtml(changeBasis)})</div>
          </div>
        </div>
        <div class="stock-card-desc">${escapeHtml(stock.description || '')}</div>
        <div class="stock-card-tags">
          ${tags.map(tag => `<span class="stock-card-tag">${escapeHtml(tag)}</span>`).join('')}
          <span class="stock-card-tag buy">${escapeHtml(stock.rating || '-')}</span>
          <span class="stock-card-tag">${escapeHtml(date)}</span>
        </div>
        <div class="stock-card-arrow">→</div>
      `;

      grid.appendChild(card);
    });
  }

  function normalizeStocks(raw) {
    if (!Array.isArray(raw)) {
      return [];
    }

    return raw
      .filter(item => item && typeof item === 'object' && typeof item.ticker === 'string')
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
