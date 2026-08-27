// Urban Update — source freshness gate.
//
// Before spending a refresh (and Anthropic tokens on a new Brief), ask each
// source whether it actually has newer data than what we last pulled. Compares
// the source's current "last updated" against the timestamp recorded in our
// processed feeds. If nothing moved, there's no reason to regenerate.
//
// Keyless for the NYC (Socrata) + FRED sources; the Census vintage check is
// skipped gracefully when CENSUS_API_KEY is absent.
//
// Exit code: 0 = everything up to date · 10 = updates available · 2 = error.
// Also writes data/processed/source-check.json. Importable via checkSources().
//
// Run: node src/check-sources.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchDatasetMeta } from './lib/socrata.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, '..', 'data', 'processed');
const OUT = join(dir, 'source-check.json');

const readJson = async (f) => { try { return JSON.parse(await readFile(join(dir, f), 'utf8')); } catch { return null; } };
const day = (t) => (t ? String(t).slice(0, 10) : null);

// Map each Socrata dataset to the timestamp WE recorded when we last pulled it.
async function ourSocrataTimestamps() {
  const [dev, tx, risk, ll97] = await Promise.all([
    readJson('development.json'), readJson('transactions.json'), readJson('risk.json'), readJson('ll97.json'),
  ]);
  const m = {};
  const add = (src) => { if (src && src.datasetId) m[src.datasetId] = src.dataUpdatedAt || null; };
  if (dev) add(dev.meta.source);
  if (tx) (tx.meta.sources || []).forEach(add);
  if (risk) (risk.meta.sources || []).forEach(add);
  if (ll97) add(ll97.meta.source);
  return m;
}

const SOCRATA_LABELS = {
  'w9ak-ipjd': 'DOB NOW Build (Development)',
  'usep-8jbt': 'DOF Rolling Sales (Transactions)',
  'w2pb-icbu': 'DOF Annualized Sales (Transactions)',
  'wvxf-dwi5': 'HPD Violations (Risk)',
  'erm2-nwe9': '311 Service Requests (Risk)',
  '6bgk-3dad': 'DOB ECB Violations (Risk)',
  '5zyy-y8am': 'LL84 Benchmarking (LL97)',
};

// Latest observation date of a FRED series (keyless CSV).
async function fredLatestDate(id) {
  try {
    const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=2026-01-01`);
    if (!res.ok) return null;
    const lines = (await res.text()).trim().split(/\r?\n/);
    for (let i = lines.length - 1; i >= 1; i--) {
      const [d, v] = lines[i].split(',');
      if (v && v !== '' && v !== '.') return d;
    }
  } catch { /* ignore */ }
  return null;
}

export async function checkSources() {
  const changes = [];
  const unknown = [];   // sources whose freshness we could NOT read → fail closed
  const items = [];

  // --- NYC Open Data (Socrata) ---
  const ours = await ourSocrataTimestamps();
  for (const id of Object.keys(SOCRATA_LABELS)) {
    const meta = await fetchDatasetMeta(id);
    const src = meta.dataUpdatedAt || null;
    const our = ours[id] || null;
    if (!src) {   // metadata unreachable after retries → freshness UNKNOWN, not "current"
      unknown.push(SOCRATA_LABELS[id]);
      items.push({ source: SOCRATA_LABELS[id], id, ourPull: day(our), sourceUpdated: null, changed: false, unknown: true });
      continue;
    }
    const changed = !!(src && (!our || day(src) > day(our)));
    items.push({ source: SOCRATA_LABELS[id], id, ourPull: day(our), sourceUpdated: day(src), changed });
    if (changed) changes.push(`${SOCRATA_LABELS[id]} (${day(our) || '—'} → ${day(src)})`);
  }

  // --- FRED (Capital) ---
  const cap = await readJson('capital.json');
  if (cap) {
    for (const r of cap.rates) {
      const src = await fredLatestDate(r.id);
      const our = r.latest.date;
      if (!src) {
        unknown.push(`FRED ${r.id}`);
        items.push({ source: `FRED ${r.id} (Capital)`, id: r.id, ourPull: day(our), sourceUpdated: null, changed: false, unknown: true });
        continue;
      }
      const changed = !!(src && day(src) > day(our));
      items.push({ source: `FRED ${r.id} (Capital)`, id: r.id, ourPull: day(our), sourceUpdated: day(src), changed });
      if (changed) changes.push(`FRED ${r.id} (${day(our)} → ${day(src)})`);
    }
  }

  // --- Census ACS (Demand): is a newer 5-year vintage published? (needs key) ---
  const demand = await readJson('demand.json');
  if (demand && demand.meta && demand.meta.vintages && process.env.CENSUS_API_KEY) {
    const cur = demand.meta.vintages.current;
    const next = cur + 1;
    let newVintage = false;
    try {
      const u = `https://api.census.gov/data/${next}/acs/acs5?get=B19013_001E&for=zip%20code%20tabulation%20area:11365&key=${process.env.CENSUS_API_KEY}`;
      const res = await fetch(u);
      newVintage = res.ok;   // 200 → vintage exists; 404 → not released yet
    } catch { /* ignore */ }
    items.push({ source: 'Census ACS 5-year (Demand)', id: `acs5-${cur}`, ourPull: `ACS5 ${cur}`, sourceUpdated: newVintage ? `ACS5 ${next} available` : `ACS5 ${cur} (latest)`, changed: newVintage });
    if (newVintage) changes.push(`Census ACS5 ${next} now available (we ship ${cur})`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    determinable: unknown.length === 0,   // false = at least one source unreachable
    unknown,
    updatesAvailable: changes.length > 0,
    changed: changes,
    sources: items,
  };
  await writeFile(OUT, JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  const r = await checkSources();
  console.log(`Source check — ${r.sources.length} sources examined.`);
  for (const s of r.sources) console.log(`  ${s.unknown ? '✗ UNKNOWN' : s.changed ? '⚠ CHANGED' : '· current'}  ${s.source}: our ${s.ourPull} | source ${s.sourceUpdated}`);
  if (!r.determinable) {
    // Fail closed: we could not read freshness for one or more sources, so the
    // state is UNKNOWN — do NOT treat it as "up to date." Exit 2 = do-not-publish.
    console.log(`\n✗ Could NOT verify freshness for ${r.unknown.length} source(s): ${r.unknown.join(', ')}.`);
    console.log('  State is UNKNOWN — not treating as up to date (fail closed).');
    console.log(`Wrote ${OUT}`);
    process.exit(2);
  }
  if (r.updatesAvailable) {
    console.log(`\n${r.changed.length} source(s) have new data — a refresh is warranted:`);
    for (const c of r.changed) console.log(`   • ${c}`);
  } else {
    console.log('\n✓ All sources reachable and up to date — no refresh needed.');
  }
  console.log(`Wrote ${OUT}`);
  process.exit(r.updatesAvailable ? 10 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(2); });
}
