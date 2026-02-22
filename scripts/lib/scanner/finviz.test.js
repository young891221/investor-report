const { parseFinvizTable, buildScreenerUrl } = require('./finviz');

const url = buildScreenerUrl('cap_smallover,fa_roe_o10', 1);
console.assert(url.includes('finviz.com/screener.ashx'), 'should include finviz base');
console.assert(url.includes('cap_smallover'), 'should include filters');
console.assert(url.includes('r=1'), 'should include page offset');

const sampleHtml = `
<table>
<tr class="styled-row">
<td class="screener-body-table-nw"><a class="screener-link-primary" href="quote.ashx?t=PLTR">PLTR</a></td>
<td>Palantir Technologies Inc</td>
<td>Technology</td>
<td>$8.2B</td>
</tr>
<tr class="styled-row">
<td class="screener-body-table-nw"><a class="screener-link-primary" href="quote.ashx?t=SNOW">SNOW</a></td>
<td>Snowflake Inc</td>
<td>Technology</td>
<td>$5.1B</td>
</tr>
</table>
`;

const results = parseFinvizTable(sampleHtml);
console.assert(Array.isArray(results), 'should return array');
console.assert(results.length === 2, `expected 2 results, got ${results.length}`);
console.assert(results[0].ticker === 'PLTR', `expected PLTR, got ${results[0].ticker}`);
console.assert(results[1].ticker === 'SNOW', `expected SNOW, got ${results[1].ticker}`);

const empty = parseFinvizTable('<html><body>No results</body></html>');
console.assert(empty.length === 0, 'should return empty for no results');

console.log('finviz.test.js: all passed');
