// Tests for the affordability math (src/lib/affordability.mjs).
// Run: node --test   (or: npm test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DOWN_PAYMENT, DTI, TERM_MONTHS,
  monthlyPI, incomeRequired, shareAtOrAbove,
} from '../src/lib/affordability.mjs';

const close = (a, b, tol = 0.5) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('disclosed assumptions are the documented values', () => {
  assert.equal(DOWN_PAYMENT, 0.20);
  assert.equal(DTI, 0.30);
  assert.equal(TERM_MONTHS, 360);
});

test('monthlyPI matches a standard amortization', () => {
  // $100,000 @ 6% / 30yr ≈ $599.55/mo (textbook value)
  close(monthlyPI(100000, 6, 360), 599.55, 0.05);
});

test('monthlyPI handles a 0% rate as straight-line', () => {
  assert.equal(monthlyPI(120000, 0, 360), 120000 / 360);
});

test('incomeRequired reproduces the D35 residential anchor ($880k @ 6.66%)', () => {
  // D35 documented: citywide $880k residential median -> ~$180,964 income to buy.
  assert.equal(Math.round(incomeRequired(880000, 6.66)), 180964);
});

test('incomeRequired is internally consistent with its parts', () => {
  const price = 750000, rate = 6.5;
  const loan = price * (1 - DOWN_PAYMENT);
  const expected = (monthlyPI(loan, rate) * 12) / DTI;
  assert.equal(incomeRequired(price, rate), expected);
});

test('incomeRequired rises with the mortgage rate (monotonic)', () => {
  assert.ok(incomeRequired(880000, 7.0) > incomeRequired(880000, 6.0));
});

test('incomeRequired returns null for an absent/non-positive price', () => {
  assert.equal(incomeRequired(0, 6), null);
  assert.equal(incomeRequired(-1, 6), null);
  assert.equal(incomeRequired(null, 6), null);
  assert.equal(incomeRequired(undefined, 6), null);
});

test('shareAtOrAbove: threshold below all income puts every household above', () => {
  const brackets = [{ lo: 0, hi: 100, count: 50 }, { lo: 100, hi: 200, count: 50 }];
  assert.equal(shareAtOrAbove(0, brackets, 100), 1);
});

test('shareAtOrAbove: interpolates uniformly within a finite bracket', () => {
  const brackets = [{ lo: 0, hi: 100, count: 50 }, { lo: 100, hi: 200, count: 50 }];
  // threshold 150 -> half of the upper bracket (25) qualifies -> 0.25
  assert.equal(shareAtOrAbove(150, brackets, 100), 0.25);
  // threshold exactly at a bracket edge -> whole upper bracket qualifies -> 0.5
  assert.equal(shareAtOrAbove(100, brackets, 100), 0.5);
});

test('shareAtOrAbove: Pareto tail on the open $200k+ bracket (alpha=2)', () => {
  const brackets = [{ lo: 200000, hi: Infinity, count: 100 }];
  // (200000/400000)^2 = 0.25 -> 25 of 100 -> 0.25
  close(shareAtOrAbove(400000, brackets, 100), 0.25, 1e-9);
});

test('shareAtOrAbove: returns null when it cannot be computed', () => {
  assert.equal(shareAtOrAbove(50000, [], 0), null);
  assert.equal(shareAtOrAbove(null, [{ lo: 0, hi: 100, count: 10 }], 10), null);
});
