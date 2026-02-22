const { getPreset, listPresets } = require('./presets');

const preset = getPreset('small-cap-growth');
console.assert(preset !== null, 'preset should exist');
console.assert(preset.name === 'small-cap-growth', `expected small-cap-growth, got ${preset.name}`);
console.assert(typeof preset.finvizFilters === 'string', 'finvizFilters should be a string');
console.assert(preset.finvizFilters.includes('cap_'), 'should include cap_ filter');
console.assert(preset.finvizFilters.includes('fa_roe_'), 'should include ROE filter');
console.assert(preset.finvizFilters.includes('fa_pe_'), 'should include PE filter');
console.assert(typeof preset.description === 'string', 'should have description');

const presets = listPresets();
console.assert(Array.isArray(presets), 'should return array');
console.assert(presets.length >= 1, 'should have at least 1 preset');

const unknown = getPreset('nonexistent');
console.assert(unknown === null, 'unknown preset should return null');

console.log('presets.test.js: all passed');
