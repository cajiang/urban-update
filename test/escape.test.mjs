// Tests for output escaping (src/lib/escape.mjs) — the dashboard's XSS defenses.
// Run: node --test   (or: npm test)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { J, esc } from '../src/lib/escape.mjs';

const U2028 = String.fromCharCode(0x2028);
const U2029 = String.fromCharCode(0x2029);

test('J neutralizes a </script> breakout in inlined data', () => {
  const payload = { note: '</script><script>alert(1)</script>' };
  const out = J(payload);
  assert.ok(!out.includes('</script>'), 'raw </script> must not survive');
  assert.ok(out.includes('\\u003c/script>'), 'the < should be escaped to \\u003c');
});

test('J neutralizes the U+2028/U+2029 line separators', () => {
  const payload = { a: 'x' + U2028 + 'y', b: 'p' + U2029 + 'q' };
  const out = J(payload);
  assert.ok(!/[\u2028\u2029]/.test(out), 'no raw line separators may remain');
  assert.ok(out.includes('\\u2028') && out.includes('\\u2029'), 'both should be \\u-escaped');
});

test('J output is still valid JSON that round-trips to the original', () => {
  // The escapes (\u003c, \u2028, \u2029) are valid JSON string escapes, so the
  // escaped text parses back to exactly the original object — data is unchanged.
  const obj = { desc: '<b>a & b</b>', sep: 'line1' + U2028 + 'line2', n: 42, arr: ['</script>', null] };
  assert.deepEqual(JSON.parse(J(obj)), obj);
});

test('J leaves ordinary content untouched', () => {
  const obj = { addr: '123 Main St', price: 880000 };
  assert.equal(J(obj), JSON.stringify(obj));
});

test('esc escapes ampersand and angle bracket, ampersand first', () => {
  assert.equal(esc('a & b < c'), 'a &amp; b &lt; c');
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)>');
  // ampersand must be escaped before the angle bracket, or &lt; would double-escape
  assert.equal(esc('&lt;'), '&amp;lt;');
});

test('esc coerces null/undefined to an empty string', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
});
