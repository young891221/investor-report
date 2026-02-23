const { getPreset, listPresets } = require('./presets');

const preset = getPreset('turnaround-growth');
console.assert(preset !== null, 'preset should exist');
console.assert(preset.name === 'turnaround-growth', `expected turnaround-growth, got ${preset.name}`);
console.assert(typeof preset.finvizFilters === 'string', 'finvizFilters should be a string');
console.assert(preset.finvizFilters.includes('cap_'), 'should include cap_ filter');
console.assert(typeof preset.description === 'string', 'should have description');

const presets = listPresets();
console.assert(Array.isArray(presets), 'should return array');
console.assert(presets.length >= 3, 'should have at least 3 presets');

const unknown = getPreset('nonexistent');
console.assert(unknown === null, 'unknown preset should return null');

const valuePreset = getPreset('turnaround-value');
console.assert(valuePreset !== null, 'turnaround-value preset should exist');

const profitPreset = getPreset('turnaround-profitability');
console.assert(profitPreset !== null, 'turnaround-profitability preset should exist');

console.log('presets.test.js: all passed');
