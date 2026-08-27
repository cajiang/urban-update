// Tests for the context-scoped Brief verifier (src/verify-brief.mjs).
// Run: node --test   (or: npm test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectPool, gazetteer, detectEntities, verifyBrief,
} from '../src/verify-brief.mjs';

// A small synthetic packet mirroring the real one's shape: two boroughs with the
// SAME-shaped numbers, a citywide figure, and a capital rate whose `name` is not
// a place (must stay general, not become a scope).
const PACKET = {
  transactions: {
    citywide_median_price: 940000,
    boroughs: [
      { name: 'Brooklyn', sales: 8000, median_price: 998800 },
      { name: 'Queens', sales: 8430, median_price: 730000 },
    ],
  },
  capital: { rates: [{ name: '30-year fixed mortgage', latest_pct: 6.67 }] },
  demand_affordability: {
    least_affordable_zips: [{ zip: '10453', area: 'University Heights', income_required_to_buy: 125698 }],
  },
};

const brief = (headline) => ({ headline, summary: '', insights: [], neighborhoods: [] });

test('collectPool tags borough numbers with their borough, not the rate name', () => {
  const pool = collectPool(PACKET);
  const bkSales = pool.find((e) => e.path === 'transactions.boroughs[0].median_price');
  assert.ok(bkSales.entities.has('brooklyn'));
  const rate = pool.find((e) => e.path === 'capital.rates[0].latest_pct');
  assert.equal(rate.entities.size, 0, 'a rate is general context, not place-scoped');
  const cityMed = pool.find((e) => e.path === 'transactions.citywide_median_price');
  assert.equal(cityMed.entities.size, 0, 'citywide figure carries no place scope');
});

test('gazetteer + detectEntities find the places named in a sentence', () => {
  const gaz = gazetteer(collectPool(PACKET));
  assert.deepEqual(detectEntities('Brooklyn sales climbed', gaz), new Set(['brooklyn']));
  assert.ok(detectEntities('activity in University Heights', gaz).has('university heights'));
  assert.equal(detectEntities('a general market note', gaz).size, 0);
});

test('a correctly-attributed figure grounds', () => {
  const { results } = verifyBrief(brief('Brooklyn median sale price is $998,800 this month.'), PACKET);
  assert.equal(results.ungrounded.length, 0);
  assert.equal(results.misattributed.length, 0);
  assert.equal(results.grounded.length, 1);
});

test('the wrong-borough error is caught as MISATTRIBUTED (the whole point)', () => {
  // $730,000 is real — but it is Queens', not Brooklyn's. A global pool would pass this.
  const { results } = verifyBrief(brief('Brooklyn median sale price is $730,000 this month.'), PACKET);
  assert.equal(results.misattributed.length, 1);
  assert.equal(results.ungrounded.length, 0);
  assert.match(results.misattributed[0].foundUnder, /boroughs\[1\]\.median_price/);
});

test('a fabricated number is UNGROUNDED (exists nowhere)', () => {
  const { results } = verifyBrief(brief('Brooklyn median sale price is $1,234,567 this month.'), PACKET);
  assert.equal(results.ungrounded.length, 1);
  assert.equal(results.misattributed.length, 0);
});

test('a citywide figure is in scope even inside a borough sentence', () => {
  // 6.67% (general rate) and $940,000 (citywide) must not be flagged just because
  // the sentence also names Brooklyn.
  const { results } = verifyBrief(brief('In Brooklyn, the citywide median is $940,000 at a 6.67% mortgage.'), PACKET);
  assert.equal(results.misattributed.length, 0);
  assert.equal(results.ungrounded.length, 0);
});

test('sentences that name no place fall back to the whole packet (no false flags)', () => {
  const { results } = verifyBrief(brief('The median sale price is $998,800 somewhere.'), PACKET);
  assert.equal(results.ungrounded.length, 0);
  assert.equal(results.misattributed.length, 0);
});

test('ZIP-scoped attribution works', () => {
  const ok = verifyBrief(brief('In 10453, income required to buy is $125,698.'), PACKET);
  assert.equal(ok.results.ungrounded.length, 0);
  assert.equal(ok.results.misattributed.length, 0);
});
