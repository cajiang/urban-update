// Urban Update — Development feed pipeline (ingest + analyze).
// Pulls DOB NOW New Building & Demolition filings from NYC Open Data,
// aggregates monthly by borough, detects regime signals with a transparent
// rule, and writes data/processed/development.json for the dashboard.
//
// Run: node src/pipeline.mjs

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SOURCES, buildUrl, soqlQuery } from './lib/socrata.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'data', 'processed', 'development.json');
const DS = SOURCES.dobNowBuild.id;

const BOROUGHS = ['Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island'];
const BASELINE_MONTHS = 12;      // trailing window that defines "normal"
const REGIME_THRESHOLD = 0.25;   // ±25% deviation flags a regime shift
const MIN_BASE_FILINGS = 20;     // ignore tiny-base noise in headline pick

// ---------- helpers ----------
const nf = (n) => Number(n || 0).toLocaleString('en-US');
const monthKey = (v) => String(v || '').slice(0, 7);           // 'YYYY-MM'
const monthStart = (k) => `${k}-01`;
const nextMonthStart = (k) => {
  const [y, m] = k.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
};
const monthLabel = (k) => {
  const [y, m] = k.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
};
const shiftYear = (k, d) => {
  const [y, m] = k.split('-');
  return `${Number(y) + d}-${m}`;
};

// ---------- ingest: monthly aggregation by borough for a job_type ----------
async function fetchMonthly(jobType) {
  const { rows, url } = await soqlQuery(DS, {
    $select:
      'borough,date_trunc_ym(filing_date) as month,count(*) as filings,sum(proposed_dwelling_units::number) as units',
    $where: `job_type='${jobType}' AND filing_date IS NOT NULL`,
    $group: 'borough,month',
    $order: 'month',
    $limit: '5000',
  });
  // index[borough][YYYY-MM] = { filings, units }
  const index = {};
  for (const r of rows) {
    const b = r.borough;
    if (!BOROUGHS.includes(b)) continue;
    (index[b] ||= {})[monthKey(r.month)] = {
      filings: Number(r.filings || 0),
      units: Number(r.units || 0),
    };
  }
  return { index, sourceUrl: url };
}

// ---------- ingest: New Building filings grouped by borough+neighborhood ----------
async function fetchNtaAgg(where) {
  const { rows } = await soqlQuery(DS, {
    $select: 'borough,nta,count(*) as filings,sum(proposed_dwelling_units::number) as units',
    $where: where,
    $group: 'borough,nta',
    $limit: '3000',
  });
  const map = {};
  for (const r of rows) {
    if (!BOROUGHS.includes(r.borough) || !r.nta) continue;
    map[`${r.borough}|${r.nta}`] = { filings: Number(r.filings || 0), units: Number(r.units || 0) };
  }
  return map;
}

const esc = (s) => String(s).replace(/'/g, "''"); // escape single quotes for SoQL

// Build per-borough neighborhood breakdown for the latest complete month,
// with trailing-12-month baseline and YoY per neighborhood.
async function buildNeighborhoods(latest) {
  const NB = "job_type='New Building' AND nta IS NOT NULL";
  const yoM = shiftYear(latest, -1);
  const [latestMap, baseMap, yoyMap] = await Promise.all([
    fetchNtaAgg(`${NB} AND filing_date>='${monthStart(latest)}' AND filing_date<'${nextMonthStart(latest)}'`),
    fetchNtaAgg(`${NB} AND filing_date>='${monthStart(yoM)}' AND filing_date<'${monthStart(latest)}'`), // 12-mo window
    fetchNtaAgg(`${NB} AND filing_date>='${monthStart(yoM)}' AND filing_date<'${nextMonthStart(yoM)}'`), // year-ago month
  ]);

  const byBorough = {};
  for (const key of Object.keys(latestMap)) {
    const [b, nta] = key.split('|');
    const cur = latestMap[key];
    const baseAvg = (baseMap[key]?.filings || 0) / BASELINE_MONTHS;
    const yoyF = yoyMap[key]?.filings || 0;
    const dev = baseAvg ? (cur.filings - baseAvg) / baseAvg : 0;
    const yoy = yoyF ? (cur.filings - yoyF) / yoyF : null;

    const cands = [{ kind: 'baseline', v: dev }];
    if (yoy != null) cands.push({ kind: 'yoy', v: yoy });
    const dom = cands.sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];

    // Suppress noisy flags on thin neighborhoods (tiny denominators explode %).
    const meaningful = baseAvg >= 2 || yoyF >= 3;
    let regime = 'In range';
    if (meaningful && dom.v >= REGIME_THRESHOLD) regime = 'Elevated';
    else if (meaningful && dom.v <= -REGIME_THRESHOLD) regime = 'Cooling';

    (byBorough[b] ||= []).push({
      nta, filings: cur.filings, units: cur.units,
      baseline: Math.round(baseAvg * 10) / 10, deviation: dev, yoy, yoyFilings: yoyF,
      dominant: dom, regime,
      evidenceUrl: buildUrl(DS, {
        $select: 'job_filing_number,house_no,street_name,nta,proposed_dwelling_units,filing_date',
        $where: `job_type='New Building' AND borough='${esc(b)}' AND nta='${esc(nta)}' AND filing_date>='${monthStart(latest)}' AND filing_date<'${nextMonthStart(latest)}'`,
        $order: 'proposed_dwelling_units::number DESC',
      }),
    });
  }
  for (const b of Object.keys(byBorough)) byBorough[b].sort((x, y) => y.filings - x.filings);
  return byBorough;
}

// ---------- ingest: largest recent NB filings (evidence table) ----------
async function fetchNotable(sinceMonthKey) {
  const { rows } = await soqlQuery(DS, {
    $select:
      'job_filing_number,house_no,street_name,borough,proposed_dwelling_units,proposed_no_of_stories,job_description,filing_date,bbl,initial_cost',
    $where: `job_type='New Building' AND filing_date >= '${monthStart(sinceMonthKey)}' AND proposed_dwelling_units IS NOT NULL`,
    $order: 'proposed_dwelling_units::number DESC',
    $limit: '24',
  });
  return rows.map((r) => ({
    filing: r.job_filing_number,
    address: [r.house_no, r.street_name].filter(Boolean).join(' ').trim(),
    borough: r.borough,
    units: Number(r.proposed_dwelling_units || 0),
    stories: Number(r.proposed_no_of_stories || 0),
    cost: Number(r.initial_cost || 0),
    date: monthKey(r.filing_date),
    description: (r.job_description || '').trim(),
    bbl: r.bbl || '',
  }));
}

// ---------- ingest: official dataset metadata (provenance + freshness) ----------
async function fetchSourceMeta() {
  const res = await fetch(`https://data.cityofnewyork.us/api/views/${DS}.json`);
  if (!res.ok) return {};
  const m = await res.json();
  let updateFrequency = '';
  const walk = (o) => {
    for (const k in o) {
      if (o[k] && typeof o[k] === 'object') walk(o[k]);
      else if (/update frequency/i.test(k)) updateFrequency = o[k];
    }
  };
  walk((m.metadata && m.metadata.custom_fields) || {});
  return {
    attribution: m.attribution || null,       // publishing agency
    provenance: m.provenance || null,          // 'official' for authoritative gov data
    updateFrequency: updateFrequency || null,  // e.g. 'Daily'
    dataUpdatedAt: m.rowsUpdatedAt ? new Date(m.rowsUpdatedAt * 1000).toISOString() : null,
  };
}

// ---------- analyze: baseline + deviation + YoY + regime flag ----------
function analyzeSeries(series, latest) {
  // series: { 'YYYY-MM': {filings, units} }, latest: complete month key
  const at = (k) => series[k] || { filings: 0, units: 0 };
  const cur = at(latest);

  // trailing baseline: the 12 complete months immediately before `latest`
  const baseKeys = [];
  let [by, bm] = latest.split('-').map(Number);
  for (let i = 0; i < BASELINE_MONTHS; i++) {
    bm -= 1; if (bm === 0) { bm = 12; by -= 1; }   // step back one month
    baseKeys.push(`${by}-${String(bm).padStart(2, '0')}`);
  }
  const present = baseKeys.filter((bk) => series[bk]);
  const baseFilings = present.reduce((s, bk) => s + at(bk).filings, 0) / (present.length || 1);
  const baseUnits = present.reduce((s, bk) => s + at(bk).units, 0) / (present.length || 1);

  const yoy = at(shiftYear(latest, -1));
  const dev = baseFilings ? (cur.filings - baseFilings) / baseFilings : 0;
  const yoyPct = yoy.filings ? (cur.filings - yoy.filings) / yoy.filings : null;

  // Dominant signal = whichever comparison (trailing-baseline vs. year-ago)
  // is the more extreme. Flag a regime shift if the dominant signal breaks ±threshold.
  // Both numbers are always shown, so the flag is fully explainable.
  const candidates = [{ kind: 'baseline', v: dev }];
  if (yoyPct != null) candidates.push({ kind: 'yoy', v: yoyPct });
  const dominant = candidates.sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];

  let regime = 'In range';
  if (dominant.v >= REGIME_THRESHOLD) regime = 'Elevated';
  else if (dominant.v <= -REGIME_THRESHOLD) regime = 'Cooling';

  return {
    latest: cur,
    baselineFilings: Math.round(baseFilings),
    baselineUnits: Math.round(baseUnits),
    baselineMonths: present.length,
    deviation: dev,
    yoy: yoyPct,
    yoyFilings: yoy.filings || 0,
    dominant,
    regime,
  };
}

// last N months of a series as an ordered array (for sparklines)
function tail(series, latest, n) {
  const out = [];
  let [y, m] = latest.split('-').map(Number);
  for (let i = 0; i < n; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    out.unshift({ month: key, ...(series[key] || { filings: 0, units: 0 }) });
    m -= 1; if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

// ---------- main ----------
async function main() {
  console.log('Ingesting DOB NOW New Building filings…');
  const nb = await fetchMonthly('New Building');
  console.log('Ingesting Full Demolition filings…');
  const demo = await fetchMonthly('Full Demolition');

  // Citywide monthly series (sum across boroughs)
  const allMonths = new Set();
  for (const b of BOROUGHS) for (const k of Object.keys(nb.index[b] || {})) allMonths.add(k);
  const city = {};
  for (const k of allMonths) {
    city[k] = BOROUGHS.reduce(
      (acc, b) => {
        const v = (nb.index[b] || {})[k] || { filings: 0, units: 0 };
        acc.filings += v.filings; acc.units += v.units; return acc;
      },
      { filings: 0, units: 0 }
    );
  }

  // Latest COMPLETE month = max month strictly before the current calendar month
  const now = new Date();
  const curMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const latest = [...allMonths].filter((k) => k < curMonthKey).sort().pop();
  console.log(`Latest complete month: ${latest}`);

  // Per-borough analysis
  const boroughs = BOROUGHS.map((b) => {
    const series = nb.index[b] || {};
    const a = analyzeSeries(series, latest);
    return {
      name: b,
      ...a,
      spark: tail(series, latest, 24),
      evidenceUrl: buildUrl(DS, {
        $select: 'job_filing_number,house_no,street_name,borough,proposed_dwelling_units,filing_date',
        $where: `job_type='New Building' AND borough='${b}' AND filing_date >= '${monthStart(latest)}' AND filing_date < '${nextMonthStart(latest)}'`,
        $order: 'proposed_dwelling_units::number DESC',
      }),
    };
  });

  const cityAnalysis = analyzeSeries(city, latest);
  cityAnalysis.spark = tail(city, latest, 24);

  // Neighborhood (NTA) breakdown per borough — for the click-in drill-down.
  console.log('Aggregating neighborhood (NTA) breakdown…');
  const nbhd = await buildNeighborhoods(latest);
  for (const b of boroughs) {
    b.neighborhoods = nbhd[b.name] || [];
    b.neighborhoodCount = b.neighborhoods.length;
  }

  // Demolitions (citywide, latest complete month) — secondary signal
  const demoCity = {};
  for (const b of BOROUGHS) for (const [k, v] of Object.entries(demo.index[b] || {})) {
    (demoCity[k] ||= { filings: 0, units: 0 }).filings += v.filings;
  }
  const demoAnalysis = analyzeSeries(demoCity, latest);

  // Headline: borough whose dominant signal is largest off a non-trivial base
  const headlineBorough = [...boroughs]
    .filter((b) => b.baselineFilings >= MIN_BASE_FILINGS)
    .sort((x, y) => Math.abs(y.dominant.v) - Math.abs(x.dominant.v))[0];

  // Notable filings: dedupe by address (a project can have several filings),
  // keeping the largest-unit / most descriptive one.
  const notableRaw = await fetchNotable(latest);
  const seen = new Set();
  const notable = notableRaw.filter((n) => {
    const key = (n.address || n.filing).toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 8);

  console.log('Fetching source provenance metadata…');
  const srcMeta = await fetchSourceMeta();

  // ---------- narration (rule-based, transparent) ----------
  const pct = (x) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}%`;
  const verb = (d) => (d >= 0 ? 'rose to' : 'fell to');
  const basisPhrase = (b) =>
    b.dominant.kind === 'yoy'
      ? `${pct(b.yoy)} year-over-year (vs. ${nf(b.yoyFilings)} a year earlier)`
      : `${pct(b.deviation)} vs. the trailing-12-month average of ${nf(b.baselineFilings)}`;

  const headline = headlineBorough
    ? `New Building filings in ${headlineBorough.name} ${verb(headlineBorough.dominant.v)} `
      + `${nf(headlineBorough.latest.filings)} in ${monthLabel(latest)} — `
      + `${basisPhrase(headlineBorough)}. Signal: ${headlineBorough.regime}.`
    : 'No borough breached the regime threshold this month.';

  const citySummary =
    `Citywide, ${nf(cityAnalysis.latest.filings)} New Building filings were logged in ${monthLabel(latest)} `
    + `(${nf(cityAnalysis.latest.units)} proposed dwelling units), `
    + `${pct(cityAnalysis.deviation)} vs. the trailing-12-month average`
    + (cityAnalysis.yoy != null ? ` and ${pct(cityAnalysis.yoy)} year-over-year.` : '.');

  const out = {
    meta: {
      product: 'Urban Update',
      feed: 'NYC Development',
      generatedAt: new Date().toISOString(),
      latestCompleteMonth: latest,
      latestMonthLabel: monthLabel(latest),
      source: {
        label: SOURCES.dobNowBuild.label,
        datasetId: DS,
        landing: SOURCES.dobNowBuild.landing,
        apiSample: nb.sourceUrl,
        publisher: srcMeta.attribution,          // NYC Department of Buildings
        provenance: srcMeta.provenance,          // 'official'
        updateFrequency: srcMeta.updateFrequency, // 'Daily'
        dataUpdatedAt: srcMeta.dataUpdatedAt,     // source's last refresh
      },
      method: {
        baseline: `Trailing ${BASELINE_MONTHS}-month average of New Building filings.`,
        threshold: `±${REGIME_THRESHOLD * 100}% deviation from baseline flags a regime shift.`,
        note: 'All figures are computed facts from primary DOB filings. Causal interpretation requires review.',
      },
    },
    narration: { headline, citySummary },
    citywide: cityAnalysis,
    boroughs,
    demolitions: { latest: demoAnalysis.latest, deviation: demoAnalysis.deviation, regime: demoAnalysis.regime },
    notable,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2));
  console.log(`\nHeadline: ${headline}`);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
