const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchYahooQuote } = require('./sources');

const PRIMARY_QUOTE_URL = 'https://query1.finance.yahoo.com/v7/finance/quote';
const SECONDARY_QUOTE_URL = 'https://query2.finance.yahoo.com/v7/finance/quote';

function passthroughRetry(fn) {
  return fn();
}

test('fetchYahooQuote falls back to secondary endpoint when primary returns 401', async () => {
  const calls = [];
  const getJsonMock = async url => {
    calls.push(url);
    if (url.startsWith(PRIMARY_QUOTE_URL)) {
      throw new Error(`HTTP 401 for ${url}`);
    }

    if (url.startsWith(SECONDARY_QUOTE_URL)) {
      return {
        quoteResponse: {
          result: [
            {
              symbol: 'RKLB',
              shortName: 'Rocket Lab',
              longName: 'Rocket Lab USA',
              exchange: 'NMS',
              quoteType: 'EQUITY',
              currency: 'USD',
              marketCap: { raw: 1234567890 },
              regularMarketPrice: { raw: 27.5 },
              fiftyTwoWeekLow: { raw: 4.2 },
              fiftyTwoWeekHigh: { raw: 35.8 },
              trailingPE: { raw: 0 },
              forwardPE: { raw: 45.2 },
              priceToSalesTrailing12Months: { raw: 12.4 },
              priceToBook: { raw: 5.1 },
              enterpriseToEbitda: { raw: 66.3 },
              beta: { raw: 1.8 },
            },
          ],
        },
      };
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await fetchYahooQuote(
    ['RKLB'],
    {
      getJson: getJsonMock,
      withRetry: passthroughRetry,
      quoteUrls: [PRIMARY_QUOTE_URL, SECONDARY_QUOTE_URL],
    }
  );

  assert.equal(calls.length, 2);
  assert.equal(result.length, 1);
  assert.equal(result[0].symbol, 'RKLB');
  assert.equal(result[0].regularMarketPrice, 27.5);
  assert.equal(result[0].marketCap, 1234567890);
});

test('fetchYahooQuote reports all endpoint failures when every Yahoo endpoint fails', async () => {
  const getJsonMock = async url => {
    throw new Error(`HTTP 401 for ${url}`);
  };

  await assert.rejects(
    fetchYahooQuote(
      ['RKLB'],
      {
        getJson: getJsonMock,
        withRetry: passthroughRetry,
        quoteUrls: [PRIMARY_QUOTE_URL, SECONDARY_QUOTE_URL],
      }
    ),
    error => {
      assert.match(error.message, /All Yahoo quote endpoints failed/);
      assert.match(error.message, new RegExp(PRIMARY_QUOTE_URL.replaceAll('/', '\\/')));
      assert.match(error.message, new RegExp(SECONDARY_QUOTE_URL.replaceAll('/', '\\/')));
      return true;
    }
  );
});
