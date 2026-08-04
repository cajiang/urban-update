// Urban Update — Capital-conditions feed (the "cost of capital" lens).
//
// Pulls key interest-rate series from FRED (Federal Reserve Bank of St. Louis)
// via the public keyless CSV endpoint — no API key, keeping the zero-dependency
// design. Then, as the *lens*, re-pulls our own NYC monthly activity (New
// Building filings + recorded sales) and measures how local activity has moved
// with the cost of capital: a Pearson correlation over the full window plus a
// "then vs. now" comparison across the rate cycle.
//
// This turns commodity national data into differentiated, local synthesis — rates
// as context on our feeds, not an isolated ticker (see DECISIONS.md D27).
//
// Association is reported as association, never causation (evidence standard).
//
// Run: node src/capital.mjs

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SOURCES, soqlQuery, fetchDatasetMeta } from './lib/socrata.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'data', 'processed', 'capital.json');

const START = '2016-01-01';                 // align with our local history
const CUR_MONTH = new Date().toISOString().slice(0, 7);
const SALES_LAG_MONTHS = 2;                 // DOF sales accrue; last ~2 months partial

// FRED series we track — the rates NYC real estate is actually priced off.
const RATES = [
  { id: 'DGS10',        name: '10-Year Treasury',  unit: '%', role: 'Benchmark for CRE cap rates & permanent debt' },
  { id: 'MORTGAGE30US', name: '30-Year Mortgage',  unit: '%', role: 'Residential / 1–4 family borrowing cost (Freddie Mac)' },
  { id: 'SOFR',         name: 'SOFR',              unit: '%', role: 'Floating-rate benchmark — construction & bridge debt' },
  { id: 'FEDFUNDS',     name: 'Fed Funds Rate',    unit: '%', role: 'Federal Reserve policy anchor' },
];

const FRED = {
  label: 'FRED — Federal Reserve Bank of St. Louis',
  host: 'fred.stlouisfed.org',
  landing: 'https://fred.stlouisfed.org',
  publisher: 'Federal Reserve Bank of St. Louis',
  provenance: 'official',
};
const seriesLanding = (id) => `https://fred.stlouisfed.org/series/${id}`;
const seriesCsv = (id) => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${START}`;

// ---------- helpers ----------
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

// Pearson correlation of two equal-length numeric arrays.
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den ? num / den : null;
}

// Trailing-n-month average of a {month:value} map ending at (inclusive) `end`.
function trailingAvg(map, end, n) {
  let sum = 0, cnt = 0, k = end;
  for (let i = 0; i < n; i++) { if (map[k] != null) { sum += map[k]; cnt++; } k = stepMonth(k, -1); }
  return cnt ? sum / cnt : null;
}

// ---------- FRED ingest ----------
// Returns { latest:{value,date}, monthly:{YYYY-MM:avg}, points:n } for a series.
async function fetchFred(id) {
  const res = await fetch(seriesCsv(id));
  if (!res.ok) throw new Error(`FRED ${res.status} for ${id}`);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  const buckets = {};       // month -> {sum,cnt}
  let latest = null;
  for (let i = 1; i < lines.length; i++) {          // skip header row
    const [date, raw] = lines[i].split(',');
    // FRED marks missing values as an empty string OR '.'; Number('') === 0,
    // so guard both before coercing (otherwise holidays enter as phantom zeros).
    const v = (raw == null || raw === '' || raw === '.') ? NaN : Number(raw);
    if (!date || !Number.isFinite(v)) continue;
    const mk = monthKey(date);
    (buckets[mk] ||= { sum: 0, cnt: 0 });
    buckets[mk].sum += v; buckets[mk].cnt += 1;
    latest = { value: v, date };                     // rows are chronological
  }
  const monthly = {};
  for (const [mk, b] of Object.entries(buckets)) monthly[mk] = b.sum / b.cnt;
  return { latest, monthly, points: Object.keys(monthly).length };
}

// ---------- local activity ingest (the lens target: housing demand) ----------
async function fetchSalesMonthly() {
  const q = (id, where) => soqlQuery(id, {
    $select: `date_trunc_ym(sale_date) as month, count(*) as sales`,
    $where: `sale_price::number > 10000 AND sale_date IS NOT NULL AND ${where}`,
    $group: 'month', $order: 'month', $limit: '50000',
  });
  const [ann, roll] = await Promise.all([
    q(SOURCES.salesAnnual.id, `sale_date < '2026-01-01'`),
    q(SOURCES.salesRolling.id, `sale_date >= '2026-01-01'`),
  ]);
  const m = {};
  for (const r of [...ann.rows, ...roll.rows]) m[monthKey(r.month)] = Number(r.sales || 0);
  return m;
}

// Complete months of an activity map (through capMonth, dropping partial months),
// intersected with rate months, from START onward.
function alignedMonths(activity, rateMonthly, capMonth) {
  return Object.keys(activity)
    .filter((k) => k >= '2016-01' && k <= capMonth && rateMonthly[k] != null)
    .sort();
}

// Correlation of the *year-over-year changes* of a rate and an activity series
// (detrended: removes the shared secular trend that inflates level correlations).
// Rate change is in level points; activity change is a percentage.
function correlate(rateMonthly, activity, rateName, vsName, capMonth) {
  const months = alignedMonths(activity, rateMonthly, capMonth);
  const xs = [], ys = [];
  for (const k of months) {
    const p = stepMonth(k, -12);
    if (rateMonthly[p] == null || activity[p] == null || activity[p] === 0) continue;
    xs.push(rateMonthly[k] - rateMonthly[p]);
    ys.push((activity[k] - activity[p]) / activity[p]);
  }
  const r = pearson(xs, ys);
  return r == null ? null : {
    rate: rateName, vs: vsName, r: Math.round(r * 100) / 100, n: xs.length,
    from: months[0], to: months[months.length - 1],
  };
}

// "Boom vs. now": the low-rate era (calendar 2021) vs. the latest 12 complete
// months. Anchored on demand (sales), which is genuinely rate-sensitive — unlike
// development filings, which track policy deadlines and the DOB NOW migration.
function cycleComparison(fred, sales, nowEnd) {
  const boomMonths = [];
  for (let m = 1; m <= 12; m++) boomMonths.push(`2021-${String(m).padStart(2, '0')}`);
  const nowMonths = [];
  let k = nowEnd;                                   // latest COMPLETE sales month
  for (let i = 0; i < 12; i++) { nowMonths.push(k); k = stepMonth(k, -1); }

  const avg = (map, keys) => {
    const vals = keys.map((x) => map[x]).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const rate = (id) => ({
    from: Math.round(avg(fred[id].monthly, boomMonths) * 100) / 100,
    to: Math.round(avg(fred[id].monthly, nowMonths) * 100) / 100,
  });
  const sFrom = avg(sales, boomMonths), sTo = avg(sales, nowMonths);

  return {
    fromLabel: '2021 (low-rate boom)',
    toLabel: `${monthLabel(nowMonths[nowMonths.length - 1])} – ${monthLabel(nowMonths[0])}`,
    treasury10: rate('DGS10'),
    mortgage30: rate('MORTGAGE30US'),
    sales: (sFrom && sTo) ? { from: Math.round(sFrom), to: Math.round(sTo), pct: (sTo - sFrom) / sFrom } : null,
    basis: 'Averages of citywide monthly figures over each period; sales are recorded market sales (price > $10,000).',
  };
}

// ---------- main ----------
async function main() {
  console.log('Fetching FRED rate series (keyless CSV)…');
  const fred = {};
  for (const r of RATES) {
    fred[r.id] = await fetchFred(r.id);
    console.log(`  ${r.id}: ${fred[r.id].latest.value} on ${fred[r.id].latest.date} (${fred[r.id].points} months)`);
  }

  console.log('Re-pulling NYC recorded sales for the lens…');
  const [sales, rollMeta] = await Promise.all([fetchSalesMonthly(), fetchDatasetMeta(SOURCES.salesRolling.id)]);
  // DOF sales lag ~2 months; the latest 1–2 months are partial. Cap all
  // sales-based analysis at the latest COMPLETE month (source update − 2),
  // matching the Transactions feed, so partial months don't bias the lens.
  const updMonth = monthKey(rollMeta.dataUpdatedAt || new Date().toISOString());
  const salesCap = stepMonth(updMonth, -SALES_LAG_MONTHS);
  console.log(`Sales rolling updated ${updMonth}; latest complete sales month: ${salesCap}`);

  // Rate cards: latest print, monthly series (for sparkline), YoY & cycle context.
  const rates = RATES.map((r) => {
    const f = fred[r.id];
    const monthsAll = Object.keys(f.monthly).sort();
    const lastM = monthsAll[monthsAll.length - 1];
    const yoyM = stepMonth(lastM, -12);
    const cur = f.monthly[lastM], prev = f.monthly[yoyM];
    let lo = monthsAll[0], hi = monthsAll[0];
    for (const k of monthsAll) { if (f.monthly[k] < f.monthly[lo]) lo = k; if (f.monthly[k] > f.monthly[hi]) hi = k; }
    const spark = monthsAll.slice(-36).map((k) => ({ month: k, v: Math.round(f.monthly[k] * 100) / 100 }));
    return {
      id: r.id, name: r.name, unit: r.unit, role: r.role,
      latest: { value: f.latest.value, date: f.latest.date },
      latestMonth: lastM,
      yoyBps: prev != null ? Math.round((cur - prev) * 100) : null,
      cycleLow: { value: Math.round(f.monthly[lo] * 100) / 100, month: lo, label: monthLabel(lo) },
      cycleHigh: { value: Math.round(f.monthly[hi] * 100) / 100, month: hi, label: monthLabel(hi) },
      spark,
      seriesLanding: seriesLanding(r.id),
    };
  });

  // The lens: cost of capital vs. housing DEMAND (sales). Development filings are
  // deliberately excluded from the correlation — the DOB NOW migration (filings
  // only became complete ~2021) and 421-a policy deadlines dominate that series,
  // so a rate correlation on it would be spurious.
  const t10 = fred.DGS10.monthly, m30 = fred.MORTGAGE30US.monthly;
  const correlations = [
    correlate(m30, sales, '30-Year Mortgage', 'Recorded sales', salesCap),
    correlate(t10, sales, '10-Year Treasury', 'Recorded sales', salesCap),
  ].filter(Boolean);
  const cycle = cycleComparison(fred, sales, salesCap);

  // Aligned monthly arrays for the overlay chart: 10-Year vs. recorded sales.
  const lensMonths = alignedMonths(sales, t10, salesCap);
  const overlay = lensMonths.map((k) => ({
    month: k, rate: Math.round(t10[k] * 100) / 100, sales: sales[k],
  }));

  const supplyNote = 'Development filings are excluded from this correlation by design: New Building filings only became complete in DOB NOW around 2021, and the series is driven more by policy deadlines (e.g., 421-a) than by interest rates. Housing demand (recorded sales) is the rate-sensitive channel.';

  const latestObsDate = rates.map((r) => r.latest.date).sort().slice(-1)[0];

  const out = {
    meta: {
      product: 'Urban Update', feed: 'Capital Conditions',
      generatedAt: new Date().toISOString(),
      source: {
        ...FRED,
        datasetId: RATES.map((r) => r.id).join(', '),
        updateFrequency: 'Daily (Treasuries, SOFR), weekly (mortgage), monthly (Fed Funds)',
        dataUpdatedAt: latestObsDate ? `${latestObsDate}T12:00:00` : null,
        note: 'Public FRED CSV endpoint — no API key required.',
      },
      method: {
        baseline: 'Monthly averages of each FRED series since 2016; YoY compares the latest month to twelve months prior (in basis points).',
        threshold: 'The lens correlates the year-over-year change in each rate with the year-over-year change in citywide recorded sales (detrended to remove the shared secular trend), plus a low-rate-boom (2021) vs. now comparison.',
        note: 'Correlation is association, not causation. Rates are one of many forces on housing demand; figures are computed facts, the linkage is interpretation.',
      },
    },
    rates,
    lens: {
      windowLabel: cycle ? `${cycle.fromLabel} → ${cycle.toLabel}` : '',
      correlations,
      cycle,
      overlay,
      supplyNote,
    },
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2));
  console.log(`\nCorrelations (YoY-change): ${correlations.map((c) => `${c.rate}↔${c.vs} r=${c.r} (n=${c.n})`).join(' · ')}`);
  if (cycle) console.log(`Cycle: 10Y ${cycle.treasury10.from}%→${cycle.treasury10.to}%, mortgage ${cycle.mortgage30.from}%→${cycle.mortgage30.to}%; sales ${cycle.sales?.pct!=null?(cycle.sales.pct>=0?'+':'')+Math.round(cycle.sales.pct*100)+'%':'—'} (${cycle.sales?.from}→${cycle.sales?.to}/mo)`);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
