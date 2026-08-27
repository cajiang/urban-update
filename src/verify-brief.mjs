// Urban Update — deterministic Brief grounding verifier (context-scoped).
//
// The AI Brief (narratives.json) may only use numbers from the evidence packet we
// hand the model. This script proves that automatically: it rebuilds the exact
// packet from the current feeds, extracts every meaningful figure from the Brief
// prose, and confirms each one traces to a real value in the packet.
//
// It is CONTEXT-AWARE. A flat global number pool would let "Brooklyn sales rose to
// 843" pass merely because 843 appears somewhere in the packet — even if 843 is
// actually Queens'. Instead, every packet number is tagged with the specific
// entities (borough / ZIP / neighborhood) it belongs to, and a figure in a
// sentence may only match values that are either general/citywide OR tagged with
// an entity that sentence names. A figure that matches only under a DIFFERENT
// entity is reported as `misattributed` — the wrong-attribution error a global
// pool cannot catch. Sentences that name no entity fall back to the whole packet,
// so ordinary citywide claims are not falsely flagged.
//
// No API key needed (pure comparison). Writes data/processed/brief-verify.json.
// Exit code: 0 = every figure grounded; 1 = ungrounded or misattributed figures.
//
// Run: node src/verify-brief.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { loadFeeds, buildEvidence } from './narrate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, '..', 'data', 'processed');
const OUT = join(dir, 'brief-verify.json');

// Documented constants that legitimately appear in prose but aren't packet data
// (e.g., the LL97 penalty rate) plus calendar years / compliance-period years.
const KNOWN_CONSTANTS = new Set([268]);
const isYear = (n) => Number.isInteger(n) && n >= 2000 && n <= 2035;

// The five boroughs — the only `name` values that denote a place (capital rates
// and LL97 property types also use `name`/`type`, which must NOT become scopes).
const BOROUGHS = new Set(['manhattan', 'bronx', 'brooklyn', 'queens', 'staten island']);
// Keys whose value always names a specific place. `name` is handled separately
// (place only when its value is a borough), so rate/type names don't pollute scope.
const PLACE_KEYS = new Set([
  'area', 'neighborhood', 'borough', 'zip', 'zip_code', 'postal_code', 'postcode',
]);

// Walk the packet into a list of { value, path, entities } — entities is the set
// of specific-place labels (lowercased) inherited from this number's ancestors.
// A number with an empty entity set is general/citywide context.
export function collectPool(obj, path = '', entities = new Set(), out = []) {
  if (obj == null) return out;
  if (typeof obj === 'number') { if (Number.isFinite(obj)) out.push({ value: obj, path, entities }); return out; }
  if (typeof obj !== 'object') return out;
  if (Array.isArray(obj)) { obj.forEach((v, i) => collectPool(v, `${path}[${i}]`, entities, out)); return out; }
  // Object: extend the inherited entity set with this object's own place labels.
  const child = new Set(entities);
  for (const k in obj) {
    const v = obj[k];
    if (typeof v !== 'string' && typeof v !== 'number') continue;
    const s = String(v).trim().toLowerCase();
    if (!s) continue;
    if (PLACE_KEYS.has(k)) child.add(s);
    else if (k === 'name' && BOROUGHS.has(s)) child.add(s);
  }
  for (const k in obj) collectPool(obj[k], path ? `${path}.${k}` : k, child, out);
  return out;
}

// The gazetteer = every specific-entity label present anywhere in the packet.
export function gazetteer(pool) {
  const g = new Set();
  for (const e of pool) for (const lab of e.entities) g.add(lab);
  return g;
}

// Which gazetteer entities does this text name? Multi-word / long labels match as
// substrings; short (< 4 char) or purely-numeric labels (ZIPs) match on word
// boundaries so "10001" doesn't hit inside "100019".
export function detectEntities(text, gaz) {
  const t = String(text || '').toLowerCase();
  const found = new Set();
  for (const lab of gaz) {
    if (!lab) continue;
    const numeric = /^\d+$/.test(lab);
    if (numeric || lab.length < 4) {
      const re = new RegExp(`(?<!\\w)${lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`);
      if (re.test(t)) found.add(lab);
    } else if (t.includes(lab)) {
      found.add(lab);
    }
  }
  return found;
}

// Split prose into sentence-ish spans so each figure is scoped to the entities
// mentioned alongside it, not the whole paragraph.
export function splitSentences(text) {
  // Break on end punctuation, allowing an optional closing quote/paren after it
  // (e.g. "…classed 'stress.' Risk…") so a quoted clause doesn't merge sentences.
  return String(text || '').split(/(?<=[.;:!?]['")’”\]]?)\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

// Pull the meaningful figures out of Brief prose: dollar amounts, percentages,
// multipliers (2.4×), and thousands-separated counts. Bare integers (years, ZIPs,
// "311") are intentionally NOT treated as claims — same rule as the dashboard's
// figure colorizer.
export function extractFigures(text) {
  const t = String(text || '');
  const specs = [
    /\$\s?\d[\d,]*(?:\.\d+)?\s?(?:million|billion|trillion|[MBK])?/gi,   // money
    /[+−-]?\d[\d,]*(?:\.\d+)?\s?%/g,                                     // percent
    /\d+(?:\.\d+)?\s?[×x](?![a-wyz])/g,                                  // multiplier 2.4×
    /\b\d{1,3}(?:,\d{3})+\b/g,                                          // thousands count
  ];
  const spans = [];
  for (const re of specs) { let m; while ((m = re.exec(t)) !== null) spans.push({ s: m.index, e: m.index + m[0].length, text: m[0].trim() }); }
  // A "$998,800" money match and a "998,800" thousands match cover the same digits;
  // keep the widest span and drop any span fully contained within a kept one so the
  // figure is counted once.
  spans.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
  const kept = [];
  for (const sp of spans) { if (kept.some((k) => sp.s >= k.s && sp.e <= k.e)) continue; kept.push(sp); }
  return [...new Set(kept.map((x) => x.text))];
}

// Turn a figure token into the raw values it could denote — each with a tolerance
// tied to the token's DISPLAYED precision, so a bare count ("99,999") must match
// near-exactly while a rounded form ("$2.3B", one decimal = ±0.05B) gets matching
// slack. This is what stops coincidental large-number matches. Spans unit forms
// (%, $M/$B/$K) and how the packet stores them (percent as an integer; big
// dollars often as millions). Returns [{ value, tol }].
export function candidatesFor(tok) {
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
    // Match on magnitude, both signs: prose carries direction in words ("down 50%",
    // "fell 50%") that the packet stores as a sign (-50). Tracing magnitude+entity
    // is this gate's job; direction/claim correctness is the adversarial audit's.
    for (const v of [base, -base]) {
      out.push({ value: v, tol: tol(unit) });          // packet stores percent as an integer
      out.push({ value: v / 100, tol: tol(unit / 100) }); // …or occasionally as a fraction
    }
  } else {
    out.push({ value: base * scale, tol: tol(unit * scale) });         // raw value (e.g. 2.3e9, 940000)
    if (scale >= 1e6) out.push({ value: base * scale / 1e6, tol: tol(unit * scale / 1e6) }); // millions-form (packet stores $ as millions)
  }
  return out;
}

// Find a pool entry whose value matches one of the candidates within tolerance.
const findMatch = (cands, entries) => {
  for (const c of cands) for (const e of entries) if (Math.abs(c.value - e.value) <= c.tol) return e;
  return null;
};

// Is an entry in scope for a sentence that names `sentEntities`? General/citywide
// entries (no entity tag) always are; place-specific entries only if they share
// an entity the sentence named.
const inScope = (entry, sentEntities) => {
  if (entry.entities.size === 0) return true;
  for (const e of entry.entities) if (sentEntities.has(e)) return true;
  return false;
};

// Verify one Brief field. Splits it into sentences; each figure is checked against
// the sentence-scoped pool, then (to distinguish misattribution from a fabricated
// number) against the whole pool.
export function verifyText(label, text, pool, gaz, results, seed = new Set()) {
  for (const sentence of splitSentences(text)) {
    // Scope = the section's own subject (e.g. a spotlight's borough) plus whatever
    // this sentence names. Seeding the subject means a Manhattan spotlight's
    // Manhattan figures stay in scope even in a sentence that also names a ZIP.
    const ents = new Set(seed);
    for (const e of detectEntities(sentence, gaz)) ents.add(e);
    const scoped = ents.size ? pool.filter((e) => inScope(e, ents)) : pool;
    for (const tok of extractFigures(sentence)) {
      const cands = candidatesFor(tok);
      if (!cands.length) continue;
      if (cands.some((c) => KNOWN_CONSTANTS.has(Math.round(c.value)) || isYear(c.value))) { results.grounded.push({ label, tok, note: 'known constant/year' }); continue; }
      const hit = findMatch(cands, scoped);
      if (hit) { results.grounded.push({ label, tok, path: hit.path }); continue; }
      // Not in scope. Does it match anywhere else? If so it's misattributed to the
      // wrong place; otherwise it is ungrounded (no such number in the packet).
      const elsewhere = findMatch(cands, pool);
      let nearest = null, best = Infinity;
      for (const c of cands) for (const e of pool) { const d = Math.abs(c.value - e.value); if (d < best) { best = d; nearest = e; } }
      if (elsewhere) {
        results.misattributed.push({ label, tok, sentence, namedEntities: [...ents], foundUnder: elsewhere.path });
      } else {
        results.ungrounded.push({ label, tok, candidates: cands.map((c) => c.value), nearestPacketValue: nearest ? nearest.value : null });
      }
    }
  }
}

export function verifyBrief(brief, packet) {
  const pool = collectPool(packet);
  const gaz = gazetteer(pool);
  const results = { grounded: [], ungrounded: [], misattributed: [] };
  verifyText('headline', brief.headline, pool, gaz, results);
  verifyText('summary', brief.summary, pool, gaz, results);
  (brief.insights || []).forEach((i, n) => { verifyText(`insight[${n}].title`, i.title, pool, gaz, results); verifyText(`insight[${n}].detail`, i.detail, pool, gaz, results); });
  (brief.neighborhoods || []).forEach((nb, n) => {
    // A spotlight is about a specific place; seed its scope with that subject
    // (area / name / borough / zip) so its own figures are always in scope.
    const seed = detectEntities([nb.area, nb.name, nb.borough, nb.zip].filter(Boolean).join(' '), gaz);
    verifyText(`neighborhood[${n}]`, nb.narrative, pool, gaz, results, seed);
  });
  return { pool, results };
}

async function main() {
  let brief;
  try { brief = JSON.parse(await readFile(join(dir, 'narratives.json'), 'utf8')); }
  catch { console.error('No narratives.json found — nothing to verify.'); process.exit(0); }

  const feeds = await loadFeeds();
  const packet = buildEvidence(feeds.dev, feeds.tx, feeds.risk, feeds.ll97, feeds.cross, feeds.capital, feeds.demand);
  const { pool, results } = verifyBrief(brief, packet);

  const total = results.grounded.length + results.ungrounded.length + results.misattributed.length;
  const pass = results.ungrounded.length === 0 && results.misattributed.length === 0;
  const report = {
    generatedAt: new Date().toISOString(),
    briefGeneratedAt: brief.meta && brief.meta.generatedAt,
    briefModel: brief.meta && brief.meta.model,
    packetNumbers: pool.length,
    figuresChecked: total,
    grounded: results.grounded.length,
    misattributed: results.misattributed,
    ungrounded: results.ungrounded,
    verdict: pass ? 'pass' : 'review',
  };
  await writeFile(OUT, JSON.stringify(report, null, 2));

  console.log(`Brief grounding: ${results.grounded.length}/${total} figures traced in context (${pool.length} packet numbers).`);
  if (results.misattributed.length) {
    console.log(`⚠ ${results.misattributed.length} figure(s) match the packet but under a place the sentence did not name (possible misattribution):`);
    for (const m of results.misattributed) console.log(`   • [${m.label}] "${m.tok}" — sentence names {${m.namedEntities.join(', ')}} but value is at ${m.foundUnder}`);
  }
  if (results.ungrounded.length) {
    console.log(`⚠ ${results.ungrounded.length} figure(s) could not be traced at all:`);
    for (const u of results.ungrounded) console.log(`   • [${u.label}] "${u.tok}" — nearest packet value ${u.nearestPacketValue}`);
  }
  if (pass) console.log('✓ Every figure in the Brief traces to the evidence packet, in context.');
  console.log(`Wrote ${OUT}`);
  process.exit(pass ? 0 : 1);
}

// Direct-run guard: importing this module (e.g. from tests) must not run main().
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(2); });
}
