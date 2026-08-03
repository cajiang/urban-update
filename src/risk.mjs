// Urban Update — Risk feed pipeline (ingest + analyze).
// Builds a transparent, severity-weighted "Risk Pressure" read per area from the
// fastest, most reliable public risk signals (all daily / official):
//   - HPD Housing Maintenance Violations (habitability; severity class B/C)
//   - 311 Service Requests (early-warning complaints to HPD/DOB)
//   - DOB ECB Violations (financial enforcement: penalties & balance due)
//
// Risk Pressure = 3×(Class C, immediately hazardous) + 1×(Class B, hazardous),
// over the trailing quarter, compared year-over-year. Weighting is explicit.
//
// Run: node src/risk.mjs

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SOURCES, buildUrl, soqlQuery, fetchDatasetMeta } from './lib/socrata.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'data', 'processed', 'risk.json');

const HPD = 'wvxf-dwi5';   // HPD Housing Maintenance Code Violations
const T311 = 'erm2-nwe9';  // 311 Service Requests 2020–present
const ECB = '6bgk-3dad';   // DOB ECB Violations
const ROLL = SOURCES.salesRolling.id; // for ZIP → neighborhood labels

const W = { C: 3, B: 1 };   // severity weights (C = immediately hazardous)
const WINDOW = 3;           // trailing quarter
const THRESH = 0.15;
const MIN_BASE = 60;        // min weighted points (current) to trust a trend
const MIN_YO = 40;          // min weighted points a year ago (so YoY isn't off a tiny base)

const BORO_NUM = { 1: 'Manhattan', 2: 'Bronx', 3: 'Brooklyn', 4: 'Queens', 5: 'Staten Island' };
const BOROUGHS = Object.values(BORO_NUM);
const titleBoro = (s) => {
  const t = String(s || '').trim().toLowerCase();
  return BOROUGHS.find((b) => b.toLowerCase() === t) || null;
};
const zip5 = (z) => String(z || '').trim().slice(0, 5);
const monthKey = (v) => String(v || '').slice(0, 7);
const stepMonth = (k, d) => { let [y, m] = k.split('-').map(Number); m += d; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
const shiftYear = (k, d) => { const [y, m] = k.split('-'); return `${Number(y) + d}-${m}`; };
const monthLabel = (k) => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }); };
const qtr = (mk) => ({ start: `${stepMonth(mk, -(WINDOW - 1))}-01`, end: `${stepMonth(mk, 1)}-01` });
const qtrLabel = (mk) => `${monthLabel(stepMonth(mk, -(WINDOW - 1)))}–${monthLabel(mk)}`;
const ymd = (iso) => iso.replace(/-/g, ''); // ECB issue_date is YYYYMMDD

const nf = (n) => Number(n || 0).toLocaleString('en-US');
const pct = (x) => x == null ? '—' : `${x >= 0 ? '+' : ''}${Math.round(x * 100)}%`;

// ---------- HPD hazardous violations by ZIP+borough+class ----------
async function hpdByZip(w) {
  const { rows } = await soqlQuery(HPD, {
    $select: 'zip,boro,class,count(*) as n',
    $where: `class in ('B','C') AND novissueddate >= '${w.start}' AND novissueddate < '${w.end}' AND zip IS NOT NULL`,
    $group: 'zip,boro,class', $limit: '20000',
  });
  const byZip = {};
  for (const r of rows) {
    const z = zip5(r.zip), b = titleBoro(r.boro); if (z.length !== 5 || !b) continue;
    const o = (byZip[z] ||= { borough: b, C: 0, B: 0 });
    o[r.class] = (o[r.class] || 0) + Number(r.n || 0);
  }
  return byZip;
}
const weighted = (o) => W.C * (o.C || 0) + W.B * (o.B || 0);

// ---------- 311 building complaints by ZIP ----------
async function t311ByZip(w) {
  const { rows } = await soqlQuery(T311, {
    $select: 'incident_zip,count(*) as n',
    $where: `agency in ('HPD','DOB') AND created_date >= '${w.start}' AND created_date < '${w.end}' AND incident_zip IS NOT NULL`,
    $group: 'incident_zip', $limit: '20000',
  });
  const m = {};
  for (const r of rows) { const z = zip5(r.incident_zip); if (z.length === 5) m[z] = (m[z] || 0) + Number(r.n || 0); }
  return m;
}

// ---------- ECB financial enforcement by borough ----------
async function ecbByBorough(w) {
  const { rows } = await soqlQuery(ECB, {
    $select: 'boro,count(*) as n,sum(penality_imposed::number) as pen,sum(balance_due::number) as bal',
    $where: `issue_date >= '${ymd(w.start)}' AND issue_date < '${ymd(w.end)}'`,
    $group: 'boro',
  });
  const m = {};
  for (const r of rows) { const b = BORO_NUM[Number(r.boro)]; if (b) m[b] = { n: Number(r.n || 0), pen: Number(r.pen || 0), bal: Number(r.bal || 0) }; }
  return m;
}

// ---------- HPD monthly weighted by borough (sparklines) ----------
async function hpdMonthly(start) {
  const { rows } = await soqlQuery(HPD, {
    $select: 'boro,date_trunc_ym(novissueddate) as m,class,count(*) as n',
    $where: `class in ('B','C') AND novissueddate >= '${start}'`,
    $group: 'boro,m,class', $limit: '5000',
  });
  const s = {}; // borough -> month -> weighted
  for (const r of rows) {
    const b = titleBoro(r.boro); if (!b) continue;
    const mk = monthKey(r.m);
    (s[b] ||= {})[mk] = (s[b][mk] || 0) + W[r.class] * Number(r.n || 0);
  }
  return s;
}
function tail(series, latest, n) {
  const out = []; let k = latest;
  for (let i = 0; i < n; i++) { out.unshift({ month: k, weighted: (series[k] || 0) }); k = stepMonth(k, -1); }
  return out;
}

// ---------- ZIP → neighborhood label (from DOF sales) ----------
async function zipLabels(w) {
  const { rows } = await soqlQuery(ROLL, {
    $select: 'zip_code as zip,neighborhood,count(*) as n',
    $where: `zip_code IS NOT NULL AND neighborhood IS NOT NULL AND sale_date >= '${w.start}' AND sale_date < '${w.end}'`,
    $group: 'zip_code,neighborhood', $order: 'n DESC', $limit: '5000',
  });
  const m = {};
  for (const r of rows) { const z = zip5(r.zip); if (!m[z]) m[z] = r.neighborhood; }
  return m;
}

function regimeOf(cur, yoBase) {
  if (cur < MIN_BASE || yoBase < MIN_YO) return { yoy: null, regime: 'Stable' };
  const y = (cur - yoBase) / yoBase;
  return { yoy: y, regime: y >= THRESH ? 'Rising' : y <= -THRESH ? 'Falling' : 'Stable' };
}

async function main() {
  const now = new Date();
  const curM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const latest = stepMonth(curM, -1);            // latest complete month
  const cw = qtr(latest), yw = qtr(shiftYear(latest, -1));
  console.log(`Risk window: ${qtrLabel(latest)} (YoY vs ${qtrLabel(shiftYear(latest, -1))})`);

  const [hpdCur, hpdYoy, t311Cur, t311Yoy, ecbCur, ecbYoy, monthly, labels, hpdMeta, t311Meta, ecbMeta] = await Promise.all([
    hpdByZip(cw), hpdByZip(yw), t311ByZip(cw), t311ByZip(yw), ecbByBorough(cw), ecbByBorough(yw),
    hpdMonthly(`${stepMonth(latest, -23)}-01`), zipLabels({ start: `${stepMonth(latest, -2)}-01`, end: `${stepMonth(latest, 1)}-01` }),
    fetchDatasetMeta(HPD), fetchDatasetMeta(T311), fetchDatasetMeta(ECB),
  ]);

  // ----- per ZIP -----
  const zips = [];
  for (const z of Object.keys(hpdCur)) {
    const cur = hpdCur[z], w = weighted(cur);
    const yo = hpdYoy[z] ? weighted(hpdYoy[z]) : 0;
    const { yoy, regime } = regimeOf(w, yo);
    zips.push({
      zip: z, borough: cur.borough, neighborhood: labels[z] || '',
      weighted: w, C: cur.C || 0, B: cur.B || 0, complaints311: t311Cur[z] || 0,
      yoy, regime,
      evidence: buildUrl(HPD, { $select: 'housenumber,streetname,zip,class,novdescription,novissueddate', $where: `class='C' AND zip='${z}' AND novissueddate >= '${cw.start}' AND novissueddate < '${cw.end}'`, $order: 'novissueddate DESC' }),
    });
  }
  zips.sort((a, b) => b.weighted - a.weighted);

  // ----- per borough -----
  const boroughs = BOROUGHS.map((name) => {
    const zs = zips.filter((z) => z.borough === name);
    const w = zs.reduce((a, z) => a + z.weighted, 0);
    const C = zs.reduce((a, z) => a + z.C, 0), B = zs.reduce((a, z) => a + z.B, 0);
    const c311 = zs.reduce((a, z) => a + z.complaints311, 0);
    // borough YoY from HPD yoy zip data
    const yo = Object.keys(hpdYoy).filter((z) => hpdYoy[z].borough === name).reduce((a, z) => a + weighted(hpdYoy[z]), 0);
    const { yoy, regime } = regimeOf(w, yo);
    const ecb = ecbCur[name] || { n: 0, bal: 0, pen: 0 };
    return {
      name, weighted: w, C, B, complaints311: c311, yoy, regime,
      ecbNew: ecb.n, ecbBalance: ecb.bal,
      neighborhoods: zs.map(({ evidence, ...rest }) => ({ ...rest, evidenceUrl: evidence })),
      neighborhoodCount: zs.length,
      spark: tail(monthly[name] || {}, latest, 24),
      evidenceUrl: buildUrl(HPD, { $select: 'housenumber,streetname,zip,class,novdescription,novissueddate', $where: `class in('B','C') AND boro='${name.toUpperCase()}' AND novissueddate >= '${cw.start}' AND novissueddate < '${cw.end}'`, $order: 'novissueddate DESC' }),
    };
  });

  // ----- citywide -----
  const cwWeighted = zips.reduce((a, z) => a + z.weighted, 0);
  const cwYoy = Object.values(hpdYoy).reduce((a, o) => a + weighted(o), 0);
  const cwC = zips.reduce((a, z) => a + z.C, 0), cwB = zips.reduce((a, z) => a + z.B, 0);
  const cw311 = Object.values(t311Cur).reduce((a, n) => a + n, 0);
  const cw311Yoy = Object.values(t311Yoy).reduce((a, n) => a + n, 0);
  const cwEcbBal = Object.values(ecbCur).reduce((a, o) => a + o.bal, 0);
  const cityRegime = regimeOf(cwWeighted, cwYoy);

  const topRising = zips.filter((z) => z.regime === 'Rising' && z.weighted >= 150)
    .sort((a, b) => b.yoy - a.yoy).slice(0, 8);

  // narration
  const worst = boroughs.slice().sort((a, b) => b.weighted - a.weighted)[0];
  const headline =
    `${worst.name} carries the highest risk pressure — ${nf(worst.weighted)} severity-weighted hazardous-violation points in ${qtrLabel(latest)} `
    + `(${nf(worst.C)} immediately-hazardous, ${nf(worst.B)} hazardous), ${pct(worst.yoy)} year-over-year. Trend: ${worst.regime}.`;
  const citySummary =
    `Citywide, ${nf(cwC)} immediately-hazardous (Class C) and ${nf(cwB)} hazardous (Class B) HPD violations were issued in ${qtrLabel(latest)}, `
    + `${pct(cityRegime.yoy)} year-over-year, alongside ${nf(cw311)} building complaints to 311 and $${nf(Math.round(cwEcbBal / 1e6))}M in new ECB penalty balances.`;

  const out = {
    meta: {
      product: 'Urban Update', feed: 'Risk',
      generatedAt: new Date().toISOString(),
      windowLabel: qtrLabel(latest), latestMonth: latest,
      method: {
        baseline: `Risk Pressure = 3 × (Class C, immediately hazardous) + 1 × (Class B, hazardous) HPD violations issued in the trailing quarter (${qtrLabel(latest)}), compared year-over-year.`,
        threshold: `A trend of ±${THRESH * 100}% YoY is Rising/Falling (needs ≥${MIN_BASE} weighted points). Class weighting is explicit, not a black box.`,
        note: 'Volume-based: dense areas naturally register more, so the year-over-year trend is the denominator-independent signal. Figures are computed facts from primary agency records; interpretation requires review. Climate/flood and compliance-deadline (LL97) risk are planned phase-2 additions.',
      },
      sources: [
        { label: 'HPD Housing Maintenance Code Violations', datasetId: HPD, landing: `https://data.cityofnewyork.us/d/${HPD}`, ...hpdMeta },
        { label: '311 Service Requests (2020–present)', datasetId: T311, landing: `https://data.cityofnewyork.us/d/${T311}`, ...t311Meta },
        { label: 'DOB ECB Violations', datasetId: ECB, landing: `https://data.cityofnewyork.us/d/${ECB}`, ...ecbMeta },
      ],
    },
    narration: { headline, citySummary },
    citywide: { weighted: cwWeighted, C: cwC, B: cwB, complaints311: cw311, complaints311Yoy: cw311Yoy, ecbBalance: cwEcbBal, ...cityRegime, spark: tail(BOROUGHS.reduce((acc, b) => { const s = monthly[b] || {}; for (const k in s) acc[k] = (acc[k] || 0) + s[k]; return acc; }, {}), latest, 24) },
    boroughs, topRising,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2));
  console.log(`\nHeadline: ${headline}`);
  console.log(`ZIPs: ${zips.length} | rising: ${topRising.length}`);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
