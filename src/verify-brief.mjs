// Urban Update — deterministic Brief grounding verifier.
//
// The AI Brief (narratives.json) is only allowed to use numbers from the evidence
// packet we hand the model. This script proves that automatically: it rebuilds the
// exact packet from the current feeds, extracts every meaningful figure from the
// Brief prose, and confirms each one traces to a real value in the packet. Any
// figure that can't be traced is flagged — that's the evidence standard enforced
// by code, not trust.
//
// No API key needed (pure comparison). Writes data/processed/brief-verify.json.
// Exit code: 0 = every figure grounded; 1 = one or more ungrounded figures.
//
// Run: node src/verify-brief.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadFeeds, buildEvidence } from './narrate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, '..', 'data', 'processed');
const OUT = join(dir, 'brief-verify.json');

// Documented constants that legitimately appear in prose but aren't packet data
// (e.g., the LL97 penalty rate) plus calendar years / compliance-period years.
const KNOWN_CONSTANTS = new Set([268]);
const isYear = (n) => Number.isInteger(n) && n >= 2000 && n <= 2035;

// Collect every finite number anywhere in the evidence packet into a flat pool.
function numberPool(obj, pool = []) {
  if (obj == null) return pool;
  if (typeof obj === 'number') { if (Number.isFinite(obj)) pool.push(obj); return pool; }
  if (Array.isArray(obj)) { for (const v of obj) numberPool(v, pool); return pool; }
  if (typeof obj === 'object') { for (const k in obj) numberPool(obj[k], pool); return pool; }
  return pool;
}

// Pull the meaningful figures out of Brief prose: dollar amounts, percentages,
// multipliers (2.4×), and thousands-separated counts. Bare integers (years, ZIPs,
// "311") are intentionally NOT treated as claims — same rule as the dashboard's
// figure colorizer.
function extractFigures(text) {
  const t = String(text || '');
  const out = [];
  const push = (re) => { let m; while ((m = re.exec(t)) !== null) out.push(m[0].trim()); };
  push(/\$\s?\d[\d,]*(?:\.\d+)?\s?(?:million|billion|trillion|[MBK])?/gi);   // money
  push(/[+−-]?\d[\d,]*(?:\.\d+)?\s?%/g);                                     // percent
  push(/\d+(?:\.\d+)?\s?[×x](?![a-wyz])/g);                                  // multiplier 2.4×
  push(/\b\d{1,3}(?:,\d{3})+\b/g);                                          // thousands count
  return [...new Set(out)];
}

// Turn a figure token into the raw values it could denote — each with a tolerance
// tied to the token's DISPLAYED precision, so a bare count ("99,999") must match
// near-exactly while a rounded form ("$2.3B", one decimal = ±0.05B) gets matching
// slack. This is what stops coincidental large-number matches. Spans unit forms
// (%, $M/$B/$K) and how the packet stores them (percent as an integer; big
// dollars often as millions). Returns [{ value, tol }].
function candidatesFor(tok) {
  const s = tok.trim();
  const neg = /^[−-]/.test(s);
  const hasPct = /%/.test(s);
  const scale = /b|billion/i.test(s) ? 1e9 : /m|million/i.test(s) ? 1e6 : /k/i.test(s) ? 1e3 : (/trillion/i.test(s) ? 1e12 : 1);
  const numStr = s.replace(/[^0-9.]/g, '');
  const num = parseFloat(numStr);
  if (!Number.isFinite(num)) return [];
  const dec = (numStr.split('.')[1] || '').length;
  const base = neg ? -num : num;
  const unit = Math.pow(10, -dec);              // value of the last shown digit, before scaling
  const tol = (u) => Math.max(0.5, 0.5 * u);    // half a last-digit, floor 0.5
  const out = [];
  if (hasPct) {
    out.push({ value: base, tol: tol(unit) });          // packet stores percent as an integer
    out.push({ value: base / 100, tol: tol(unit / 100) }); // …or occasionally as a fraction
  } else {
    out.push({ value: base * scale, tol: tol(unit * scale) });         // raw value (e.g. 2.3e9, 940000)
    if (scale >= 1e6) out.push({ value: base * scale / 1e6, tol: tol(unit * scale / 1e6) }); // millions-form (packet stores $ as millions)
  }
  return out;
}

const matchesAny = (cands, pool) => cands.some((c) => pool.some((p) => Math.abs(c.value - p) <= c.tol));

function verifyText(label, text, pool, results) {
  for (const tok of extractFigures(text)) {
    const cands = candidatesFor(tok);
    if (!cands.length) continue;
    if (cands.some((c) => KNOWN_CONSTANTS.has(Math.round(c.value)) || isYear(c.value))) { results.grounded.push({ label, tok, note: 'known constant/year' }); continue; }
    if (matchesAny(cands, pool)) { results.grounded.push({ label, tok }); continue; }
    // nearest packet value, for the human-readable report
    let nearest = null, best = Infinity;
    for (const c of cands) for (const p of pool) { const d = Math.abs(c.value - p); if (d < best) { best = d; nearest = p; } }
    results.ungrounded.push({ label, tok, candidates: cands.map((c) => c.value), nearestPacketValue: nearest });
  }
}

async function main() {
  let brief;
  try { brief = JSON.parse(await readFile(join(dir, 'narratives.json'), 'utf8')); }
  catch { console.error('No narratives.json found — nothing to verify.'); process.exit(0); }

  const feeds = await loadFeeds();
  const packet = buildEvidence(feeds.dev, feeds.tx, feeds.risk, feeds.ll97, feeds.cross, feeds.capital, feeds.demand);
  const pool = numberPool(packet);

  const results = { grounded: [], ungrounded: [] };
  verifyText('headline', brief.headline, pool, results);
  verifyText('summary', brief.summary, pool, results);
  (brief.insights || []).forEach((i, n) => { verifyText(`insight[${n}].title`, i.title, pool, results); verifyText(`insight[${n}].detail`, i.detail, pool, results); });
  (brief.neighborhoods || []).forEach((nb, n) => verifyText(`neighborhood[${n}]`, nb.narrative, pool, results));

  const total = results.grounded.length + results.ungrounded.length;
  const pass = results.ungrounded.length === 0;
  const report = {
    generatedAt: new Date().toISOString(),
    briefGeneratedAt: brief.meta && brief.meta.generatedAt,
    briefModel: brief.meta && brief.meta.model,
    packetNumbers: pool.length,
    figuresChecked: total,
    grounded: results.grounded.length,
    ungrounded: results.ungrounded,
    verdict: pass ? 'pass' : 'review',
  };
  await writeFile(OUT, JSON.stringify(report, null, 2));

  console.log(`Brief grounding: ${results.grounded.length}/${total} figures traced to the evidence packet (${pool.length} packet numbers).`);
  if (!pass) {
    console.log(`⚠ ${results.ungrounded.length} figure(s) could not be traced:`);
    for (const u of results.ungrounded) console.log(`   • [${u.label}] "${u.tok}" — nearest packet value ${u.nearestPacketValue}`);
  } else {
    console.log('✓ Every figure in the Brief traces to the evidence packet.');
  }
  console.log(`Wrote ${OUT}`);
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(2); });
