(function (globalScope) {
  const TEMPLATE_QUERY_KEY = 'template';
  const STORAGE_KEY = 'uiTemplateVersion';
  const DEFAULT_TEMPLATE = 'v1';
  const VALID_TEMPLATES = new Set(['v1', 'v2']);

  function normalizeTemplate(value) {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    return VALID_TEMPLATES.has(normalized) ? normalized : null;
  }

  function resolveTemplateSelection(options) {
    const source = options && typeof options === 'object' ? options : {};
    const defaultTemplate = normalizeTemplate(source.defaultTemplate) || DEFAULT_TEMPLATE;
    const urlTemplate = normalizeTemplate(source.urlTemplate);
    if (urlTemplate) {
      return { template: urlTemplate, source: 'url' };
    }

    const storageTemplate = normalizeTemplate(source.storageTemplate);
    if (storageTemplate) {
      return { template: storageTemplate, source: 'storage' };
    }

    return { template: defaultTemplate, source: 'default' };
  }

  function setTemplateInHref(href, rawTemplate) {
    if (typeof href !== 'string') {
      return href;
    }

    const template = normalizeTemplate(rawTemplate);
    if (!template) {
      return href;
    }

    const trimmed = href.trim();
    if (!trimmed || trimmed.startsWith('#') || /^(mailto:|tel:|javascript:)/iu.test(trimmed)) {
      return href;
    }

    const hashIndex = trimmed.indexOf('#');
    const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : '';
    const pathAndQuery = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
    const queryIndex = pathAndQuery.indexOf('?');
    const path = queryIndex >= 0 ? pathAndQuery.slice(0, queryIndex) : pathAndQuery;
    const queryText = queryIndex >= 0 ? pathAndQuery.slice(queryIndex + 1) : '';
    const params = new URLSearchParams(queryText);

    params.set(TEMPLATE_QUERY_KEY, template);
    const nextQuery = params.toString();
    return `${path}${nextQuery ? `?${nextQuery}` : ''}${hash}`;
  }

  function readTemplateFromUrl() {
    if (!globalScope || !globalScope.location) {
      return null;
    }
    try {
      const params = new URLSearchParams(globalScope.location.search);
      return normalizeTemplate(params.get(TEMPLATE_QUERY_KEY));
    } catch (error) {
      return null;
    }
  }

  function readTemplateFromStorage() {
    if (!globalScope || !globalScope.localStorage) {
      return null;
    }

    try {
      return normalizeTemplate(globalScope.localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      return null;
    }
  }

  function writeTemplateToStorage(template) {
    if (!globalScope || !globalScope.localStorage) {
      return;
    }
    try {
      globalScope.localStorage.setItem(STORAGE_KEY, template);
    } catch (error) {
      // ignore browser storage errors
    }
  }

  function getCurrentTemplate() {
    if (globalScope && globalScope.document && globalScope.document.documentElement) {
      return normalizeTemplate(globalScope.document.documentElement.dataset.template) || DEFAULT_TEMPLATE;
    }
    return DEFAULT_TEMPLATE;
  }

  function applyTemplateToDom(template) {
    const resolved = normalizeTemplate(template) || DEFAULT_TEMPLATE;
    if (globalScope && globalScope.document && globalScope.document.documentElement) {
      globalScope.document.documentElement.dataset.template = resolved;
    }
    return resolved;
  }

  function syncTemplateInUrl(template) {
    if (!globalScope || !globalScope.history || !globalScope.location) {
      return;
    }

    const currentHref = `${globalScope.location.pathname}${globalScope.location.search}${globalScope.location.hash}`;
    const nextHref = setTemplateInHref(currentHref, template);
    if (nextHref && nextHref !== currentHref) {
      globalScope.history.replaceState(null, '', nextHref);
    }
  }

  function isTemplateTargetHref(href) {
    if (typeof href !== 'string') {
      return false;
    }
    const value = href.trim();
    if (!value || value.startsWith('#') || /^(mailto:|tel:|javascript:)/iu.test(value)) {
      return false;
    }

    if (/^https?:\/\//iu.test(value)) {
      try {
        if (!globalScope || !globalScope.location) {
          return false;
        }
        const url = new URL(value);
        if (url.origin !== globalScope.location.origin) {
          return false;
        }
        return /(?:^|\/)(index|stock)\.html$/iu.test(url.pathname);
      } catch (error) {
        return false;
      }
    }

    return /(?:^|\/)(index|stock)\.html(?:[?#]|$)/iu.test(value);
  }

  function decorateHref(href) {
    return setTemplateInHref(href, getCurrentTemplate());
  }

  function decorateTemplateAnchors(root) {
    if (!root || typeof root.querySelectorAll !== 'function') {
      return;
    }
    const currentTemplate = getCurrentTemplate();
    root.querySelectorAll('a[href]').forEach(anchor => {
      const href = anchor.getAttribute('href');
      if (!isTemplateTargetHref(href)) {
        return;
      }

      const nextHref = setTemplateInHref(href, currentTemplate);
      if (nextHref && nextHref !== href) {
        anchor.setAttribute('href', nextHref);
      }
    });
  }

  function renderSwitchState(template) {
    const root = globalScope && globalScope.document ? globalScope.document : null;
    if (!root) {
      return;
    }

    root.querySelectorAll('[data-template-switch]').forEach(switchEl => {
      switchEl.querySelectorAll('[data-template-value]').forEach(button => {
        const value = normalizeTemplate(button.getAttribute('data-template-value'));
        const active = value === template;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    });
  }

  function dispatchTemplateChange(template, source) {
    if (!globalScope || typeof globalScope.dispatchEvent !== 'function' || typeof globalScope.CustomEvent !== 'function') {
      return;
    }

    globalScope.dispatchEvent(new globalScope.CustomEvent('templatechange', {
      detail: { template, source },
    }));
  }

  function setTemplate(template, options) {
    const settings = options && typeof options === 'object' ? options : {};
    const nextTemplate = applyTemplateToDom(template);

    if (settings.persist !== false) {
      writeTemplateToStorage(nextTemplate);
    }
    if (settings.syncUrl !== false) {
      syncTemplateInUrl(nextTemplate);
    }

    if (globalScope && globalScope.document) {
      decorateTemplateAnchors(globalScope.document);
      renderSwitchState(nextTemplate);
    }

    if (
      settings.source === 'toggle'
      && settings.reloadOnToggle !== false
      && globalScope
      && globalScope.location
      && typeof globalScope.location.reload === 'function'
    ) {
      globalScope.location.reload();
      return nextTemplate;
    }

    if (settings.dispatch !== false) {
      dispatchTemplateChange(nextTemplate, settings.source || 'manual');
      if (typeof globalScope.dispatchEvent === 'function' && typeof globalScope.Event === 'function') {
        globalScope.dispatchEvent(new globalScope.Event('resize'));
      }
    }

    return nextTemplate;
  }

  function bindTemplateSwitches() {
    const root = globalScope && globalScope.document ? globalScope.document : null;
    if (!root) {
      return;
    }

    root.querySelectorAll('[data-template-switch]').forEach(switchEl => {
      if (switchEl.dataset.templateBound === 'true') {
        return;
      }

      switchEl.dataset.templateBound = 'true';
      switchEl.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target.closest('[data-template-value]') : null;
        if (!target) {
          return;
        }
        const selected = normalizeTemplate(target.getAttribute('data-template-value'));
        if (!selected) {
          return;
        }
        if (selected === getCurrentTemplate()) {
          return;
        }
        setTemplate(selected, { source: 'toggle' });
      });
    });
  }

  function initializeTemplateMode() {
    const resolved = resolveTemplateSelection({
      urlTemplate: readTemplateFromUrl(),
      storageTemplate: readTemplateFromStorage(),
      defaultTemplate: DEFAULT_TEMPLATE,
    });

    setTemplate(resolved.template, {
      source: resolved.source,
      syncUrl: true,
      persist: true,
      dispatch: false,
    });

    const root = globalScope && globalScope.document ? globalScope.document : null;
    if (!root) {
      return resolved.template;
    }

    const mount = () => {
      bindTemplateSwitches();
      decorateTemplateAnchors(root);
      renderSwitchState(getCurrentTemplate());
    };

    if (root.readyState === 'loading') {
      root.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }

    return resolved.template;
  }

  const api = {
    DEFAULT_TEMPLATE,
    STORAGE_KEY,
    TEMPLATE_QUERY_KEY,
    normalizeTemplate,
    resolveTemplateSelection,
    setTemplateInHref,
    getTemplate: getCurrentTemplate,
    setTemplate,
    decorateHref,
    decorateTemplateAnchors,
    initializeTemplateMode,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      DEFAULT_TEMPLATE,
      STORAGE_KEY,
      TEMPLATE_QUERY_KEY,
      normalizeTemplate,
      resolveTemplateSelection,
      setTemplateInHref,
    };
  }

  if (globalScope && globalScope.document) {
    globalScope.TemplateMode = api;
    initializeTemplateMode();
  }
}(typeof window !== 'undefined' ? window : globalThis));
