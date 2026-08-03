// Urban Update — Transactions feed pipeline (ingest + analyze).
// Pulls DOF property sales (Annualized 2016–2025 + Rolling 2026→) from NYC Open
// Data, builds a continuous monthly series by borough, detects regime shifts on
// sales volume, and writes data/processed/transactions.json for the dashboard.
//
// Run: node src/transactions.mjs

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SOURCES, buildUrl, soqlQuery, fetchDatasetMeta } from './lib/socrata.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'data', 'processed', 'transactions.json');

const ROLL = SOURCES.salesRolling.id;   // usep-8jbt (>= 2026-01)
const ANN = SOURCES.salesAnnual.id;     // w2pb-icbu (<= 2025-12)
const SPLIT = '2026-01-01';             // annualized before, rolling on/after

const BORO = { 1: 'Manhattan', 2: 'Bronx', 3: 'Brooklyn', 4: 'Queens', 5: 'Staten Island' };
const BOROUGHS = Object.values(BORO);
const PRICE_MIN = 10000;                 // drop $0 / nominal transfers
const BASELINE_MONTHS = 12;
const REGIME_THRESHOLD = 0.25;
const LAG_MONTHS = 2;                    // sales accrue; treat last 2 months as partial

// ---------- helpers ----------
const nf = (n) => Number(n || 0).toLocaleString('en-US');
const monthKey = (v) => String(v || '').slice(0, 7);
const monthLabel = (k) => {
  const [y, m] = k.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
};
const stepMonth = (k, d) => {
  let [y, m] = k.split('-').map(Number);
  m += d; while (m < 1) { m += 12; y -= 1; } while (m > 12) { m -= 12; y += 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
};
const shiftYear = (k, d) => { const [y, m] = k.split('-'); return `${Number(y) + d}-${m}`; };
const boroName = (b) => BORO[Number(b)] || null;

// ---------- ingest: monthly sales aggregation ----------
async function fetchSales(datasetId, dateWhere, groupBorough) {
  const sel = [
    groupBorough ? 'borough' : null,
    'date_trunc_ym(sale_date) as month',
    'count(*) as sales',
    'sum(sale_price::number) as vol',
    'median(sale_price::number) as med',
  ].filter(Boolean).join(',');
  const { rows } = await soqlQuery(datasetId, {
    $select: sel,
    $where: `sale_price::number > ${PRICE_MIN} AND sale_date IS NOT NULL AND ${dateWhere}`,
    $group: groupBorough ? 'borough,month' : 'month',
    $order: 'month',
    $limit: '50000',
  });
  return rows;
}

// Merge annualized (≤2025-12) + rolling (≥2026-01) into one monthly series.
function toSeries(rows, keyFn) {
  const s = {};
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null) continue;
    (s[k.g] ||= {})[monthKey(r.month)] = {
      sales: Number(r.sales || 0), vol: Number(r.vol || 0), med: Number(r.med || 0),
    };
  }
  return s;
}

// ---------- analyze ----------
function analyze(series, latest) {
  const at = (k) => series[k] || { sales: 0, vol: 0, med: 0 };
  const cur = at(latest);
  const baseKeys = [];
  for (let i = 1; i <= BASELINE_MONTHS; i++) baseKeys.push(stepMonth(latest, -i));
  const present = baseKeys.filter((k) => series[k]);
  const baseSales = present.reduce((a, k) => a + at(k).sales, 0) / (present.length || 1);
  const yoy = at(shiftYear(latest, -1));

  const dev = baseSales ? (cur.sales - baseSales) / baseSales : 0;
  const yoyPct = yoy.sales ? (cur.sales - yoy.sales) / yoy.sales : null;
  const medYoY = yoy.med ? (cur.med - yoy.med) / yoy.med : null;
  const volYoY = yoy.vol ? (cur.vol - yoy.vol) / yoy.vol : null;

  const cands = [{ kind: 'baseline', v: dev }];
  if (yoyPct != null) cands.push({ kind: 'yoy', v: yoyPct });
  const dom = cands.sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
  let regime = 'In range';
  if (dom.v >= REGIME_THRESHOLD) regime = 'Elevated';
  else if (dom.v <= -REGIME_THRESHOLD) regime = 'Cooling';

  return {
    latest: cur, baselineSales: Math.round(baseSales), baselineMonths: present.length,
    deviation: dev, yoy: yoyPct, yoySales: yoy.sales || 0,
    medianYoY: medYoY, volumeYoY: volYoY, dominant: dom, regime,
  };
}

function tail(series, latest, n) {
  const out = [];
  let k = latest;
  for (let i = 0; i < n; i++) { out.unshift({ month: k, ...(series[k] || { sales: 0, vol: 0, med: 0 }) }); k = stepMonth(k, -1); }
  return out;
}

// ---------- notable individual sales ----------
async function fetchNotable(latest) {
  const start = `${latest}-01`, end = `${stepMonth(latest, 1)}-01`;
  const { rows } = await soqlQuery(ROLL, {
    $select: 'address,borough,neighborhood,building_class_category,sale_price,sale_date',
    $where: `sale_price::number > ${PRICE_MIN} AND sale_date >= '${start}' AND sale_date < '${end}'`,
    $order: 'sale_price::number DESC',
    $limit: '20',
  });
  const seen = new Set();
  return rows.map((r) => ({
    address: (r.address || '').trim(), borough: boroName(r.borough),
    neighborhood: (r.neighborhood || '').trim(),
    type: (r.building_class_category || '').replace(/^\d+\s*/, '').trim(),
    price: Number(r.sale_price || 0), date: monthKey(r.sale_date),
  })).filter((n) => {
    const k = (n.address + '|' + n.borough).toUpperCase();
    if (seen.has(k)) return false; seen.add(k); return true;
  }).slice(0, 8);
}

// ---------- ingest: sales grouped by borough+neighborhood ----------
const esc = (s) => String(s).replace(/'/g, "''");

async function fetchNbhd(datasetId, where, withMedian) {
  const sel = ['borough', 'neighborhood', 'count(*) as sales', withMedian ? 'median(sale_price::number) as med' : null]
    .filter(Boolean).join(',');
  const { rows } = await soqlQuery(datasetId, {
    $select: sel,
    $where: `sale_price::number > ${PRICE_MIN} AND sale_date IS NOT NULL AND neighborhood IS NOT NULL AND ${where}`,
    $group: 'borough,neighborhood',
    $limit: '5000',
  });
  return rows;
}

// Neighborhood (DOF) breakdown per borough for the latest complete month,
// with trailing-12-month baseline and YoY.
async function buildNeighborhoods(latest) {
  const lmStart = `${latest}-01`, lmEnd = `${stepMonth(latest, 1)}-01`;
  const baseStart = `${stepMonth(latest, -BASELINE_MONTHS)}-01`, baseEnd = lmStart;
  const yoM = shiftYear(latest, -1), yoyStart = `${yoM}-01`, yoyEnd = `${stepMonth(yoM, 1)}-01`;

  const [latestRows, baseAnn, baseRoll, yoyRows] = await Promise.all([
    fetchNbhd(ROLL, `sale_date >= '${lmStart}' AND sale_date < '${lmEnd}'`, true),
    fetchNbhd(ANN, `sale_date >= '${baseStart}' AND sale_date < '${SPLIT}'`, false),
    fetchNbhd(ROLL, `sale_date >= '${SPLIT}' AND sale_date < '${baseEnd}'`, false),
    fetchNbhd(ANN, `sale_date >= '${yoyStart}' AND sale_date < '${yoyEnd}'`, false),
  ]);

  const key = (r) => `${r.borough}|${r.neighborhood}`;
  const baseMap = {};
  for (const r of [...baseAnn, ...baseRoll]) baseMap[key(r)] = (baseMap[key(r)] || 0) + Number(r.sales || 0);
  const yoyMap = {};
  for (const r of yoyRows) yoyMap[key(r)] = Number(r.sales || 0);

  const byBorough = {};
  for (const r of latestRows) {
    const name = boroName(r.borough); if (!name) continue;
    const sales = Number(r.sales || 0), med = Number(r.med || 0);
    const baseAvg = (baseMap[key(r)] || 0) / BASELINE_MONTHS;
    const yoyF = yoyMap[key(r)] || 0;
    const dev = baseAvg ? (sales - baseAvg) / baseAvg : 0;
    const yoy = yoyF ? (sales - yoyF) / yoyF : null;
    const cands = [{ kind: 'baseline', v: dev }];
    if (yoy != null) cands.push({ kind: 'yoy', v: yoy });
    const dom = cands.sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
    const meaningful = baseAvg >= 5 || yoyF >= 5;
    let regime = 'In range';
    if (meaningful && dom.v >= REGIME_THRESHOLD) regime = 'Elevated';
    else if (meaningful && dom.v <= -REGIME_THRESHOLD) regime = 'Cooling';

    (byBorough[name] ||= []).push({
      neighborhood: r.neighborhood, sales, med,
      baseline: Math.round(baseAvg * 10) / 10, deviation: dev, yoy, yoySales: yoyF,
      dominant: dom, regime,
      evidenceUrl: buildUrl(ROLL, {
        $select: 'address,neighborhood,sale_price,sale_date,building_class_category',
        $where: `borough='${r.borough}' AND neighborhood='${esc(r.neighborhood)}' AND sale_price::number > ${PRICE_MIN} AND sale_date >= '${lmStart}' AND sale_date < '${lmEnd}'`,
        $order: 'sale_price::number DESC',
      }),
    });
  }
  for (const b of Object.keys(byBorough)) byBorough[b].sort((x, y) => y.sales - x.sales);
  return byBorough;
}

// ---------- main ----------
async function main() {
  console.log('Ingesting DOF sales (annualized + rolling)…');
  const annWhere = `sale_date < '${SPLIT}'`;
  const rollWhere = `sale_date >= '${SPLIT}'`;
  const [annB, rollB, annC, rollC] = await Promise.all([
    fetchSales(ANN, annWhere, true), fetchSales(ROLL, rollWhere, true),
    fetchSales(ANN, annWhere, false), fetchSales(ROLL, rollWhere, false),
  ]);

  // borough series (keyed by borough name)
  const boroSeries = toSeries([...annB, ...rollB], (r) => {
    const g = boroName(r.borough); return g ? { g } : null;
  });
  // citywide series
  const citySeries = toSeries([...annC, ...rollC], () => ({ g: 'city' })).city || {};

  // latest COMPLETE month = rolling update-month − LAG_MONTHS
  const rollMeta = await fetchDatasetMeta(ROLL);
  const updMonth = monthKey(rollMeta.dataUpdatedAt || new Date().toISOString());
  const latest = stepMonth(updMonth, -LAG_MONTHS);
  console.log(`Rolling updated ${updMonth}; latest complete sales month: ${latest}`);

  const boroughs = BOROUGHS.map((name) => {
    const series = boroSeries[name] || {};
    const a = analyze(series, latest);
    return {
      name, ...a, spark: tail(series, latest, 24),
      evidenceUrl: buildUrl(ROLL, {
        $select: 'address,neighborhood,sale_price,sale_date,building_class_category',
        $where: `borough='${Object.keys(BORO).find((k) => BORO[k] === name)}' AND sale_price::number > ${PRICE_MIN} AND sale_date >= '${latest}-01' AND sale_date < '${stepMonth(latest, 1)}-01'`,
        $order: 'sale_price::number DESC',
      }),
    };
  });

  const city = analyze(citySeries, latest);
  city.spark = tail(citySeries, latest, 24);

  console.log('Aggregating neighborhood (DOF) breakdown…');
  const nbhd = await buildNeighborhoods(latest);
  for (const b of boroughs) {
    b.neighborhoods = nbhd[b.name] || [];
    b.neighborhoodCount = b.neighborhoods.length;
  }

  const notable = await fetchNotable(latest);

  // provenance (both datasets)
  const [rMeta, aMeta] = await Promise.all([rollMeta, fetchDatasetMeta(ANN)]);

  // narration
  const pct = (x) => x == null ? '—' : `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;
  const mover = boroughs.filter((b) => b.baselineSales >= 50)
    .sort((x, y) => Math.abs(y.dominant.v) - Math.abs(x.dominant.v))[0];
  const headline = mover
    ? `Property sales in ${mover.name} ${mover.dominant.v >= 0 ? 'rose to' : 'fell to'} ${nf(mover.latest.sales)} in ${monthLabel(latest)} — `
      + `${mover.dominant.kind === 'yoy' ? `${pct(mover.yoy)} year-over-year` : `${pct(mover.deviation)} vs. the trailing-12-month average`}. `
      + `Signal: ${mover.regime}.`
    : 'No borough breached the regime threshold this month.';
  const citySummary =
    `Citywide, ${nf(city.latest.sales)} recorded market sales in ${monthLabel(latest)} `
    + `(median $${nf(Math.round(city.latest.med))}, total volume $${nf(Math.round(city.latest.vol / 1e9))}B), `
    + `${pct(city.deviation)} vs. the trailing-12-month average`
    + (city.yoy != null ? ` and ${pct(city.yoy)} year-over-year.` : '.');

  const out = {
    meta: {
      product: 'Urban Update', feed: 'NYC Transactions',
      generatedAt: new Date().toISOString(),
      latestCompleteMonth: latest, latestMonthLabel: monthLabel(latest),
      sources: [
        { label: SOURCES.salesRolling.label, datasetId: ROLL, landing: SOURCES.salesRolling.landing, ...rMeta },
        { label: SOURCES.salesAnnual.label, datasetId: ANN, landing: SOURCES.salesAnnual.landing, ...aMeta },
      ],
      method: {
        baseline: `Trailing ${BASELINE_MONTHS}-month average of recorded market sales (sale price > $${nf(PRICE_MIN)}).`,
        threshold: `±${REGIME_THRESHOLD * 100}% deviation (dominant of trailing-avg vs. YoY) flags a regime shift.`,
        lag: `Sales accrue for weeks after they occur; the latest ${LAG_MONTHS} months are still filling in, so the latest complete month shown is ${monthLabel(latest)}.`,
        note: 'Figures are computed facts from primary DOF sales records. Causal interpretation requires review.',
      },
    },
    narration: { headline, citySummary },
    citywide: city, boroughs, notable,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2));
  console.log(`\nHeadline: ${headline}`);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
