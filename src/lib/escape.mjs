// Urban Update — output escaping (pure, no I/O).
//
// The dashboard is a single self-contained HTML file with all source JSON and AI
// output inlined. These two helpers keep hostile values in public data (a DOB
// filing description, a DOF address, model output) from breaking out of their
// context. Factored out of build-dashboard.mjs so they can be unit-tested.

const BS = String.fromCharCode(92);          // a single backslash
const U2028 = String.fromCharCode(0x2028);   // line separator
const U2029 = String.fromCharCode(0x2029);   // paragraph separator

// Escape a value for safe inlining inside a <script> element as `const X = <json>`.
// Neutralizes the </script> breakout (angle bracket -> backslash-u003c) and the
// U+2028/U+2029 line separators, which are valid JSON but terminate a JS string
// literal. Each is replaced by its 6-character backslash-u escape, which a JS
// parser reads back as the original character, so the inlined data is unchanged.
export const J = (o) =>
  JSON.stringify(o)
    .replace(/</g, BS + 'u003c')
    .split(U2028).join(BS + 'u2028')
    .split(U2029).join(BS + 'u2029');

// Escape a string for insertion into HTML text/attribute context. Ampersand
// first (so we don't double-escape), then the angle bracket that opens a tag.
export function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
