const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_TEMPLATE,
  normalizeTemplate,
  resolveTemplateSelection,
  setTemplateInHref,
} = require('../../js/template-mode');

test('normalizeTemplate accepts only v1/v2 values', () => {
  assert.equal(normalizeTemplate('V1'), 'v1');
  assert.equal(normalizeTemplate('  v2 '), 'v2');
  assert.equal(normalizeTemplate(''), null);
  assert.equal(normalizeTemplate('modern'), null);
});

test('resolveTemplateSelection prioritizes URL over storage', () => {
  const resolved = resolveTemplateSelection({
    urlTemplate: 'v2',
    storageTemplate: 'v1',
    defaultTemplate: DEFAULT_TEMPLATE,
  });

  assert.deepEqual(resolved, {
    template: 'v2',
    source: 'url',
  });
});

test('resolveTemplateSelection falls back to storage and then default', () => {
  const fromStorage = resolveTemplateSelection({
    urlTemplate: 'invalid',
    storageTemplate: 'v2',
    defaultTemplate: DEFAULT_TEMPLATE,
  });
  assert.deepEqual(fromStorage, {
    template: 'v2',
    source: 'storage',
  });

  const fromDefault = resolveTemplateSelection({
    urlTemplate: null,
    storageTemplate: null,
    defaultTemplate: DEFAULT_TEMPLATE,
  });
  assert.deepEqual(fromDefault, {
    template: 'v1',
    source: 'default',
  });
});

test('setTemplateInHref preserves existing query parameters and hash', () => {
  assert.equal(
    setTemplateInHref('stock.html?ticker=IREN&date=2026-02-18', 'v2'),
    'stock.html?ticker=IREN&date=2026-02-18&template=v2'
  );

  assert.equal(
    setTemplateInHref('index.html#stocks', 'v2'),
    'index.html?template=v2#stocks'
  );
});

test('setTemplateInHref ignores unsupported template values', () => {
  assert.equal(
    setTemplateInHref('index.html?ticker=RKLB', 'unknown'),
    'index.html?ticker=RKLB'
  );

  assert.equal(
    setTemplateInHref('#summary', 'v2'),
    '#summary'
  );
});
