// Urban Update — Cross-Signal module.
// Joins the Development feed (DOB New Building filings, by property ZIP) and the
// Transactions feed (DOF sales, by ZIP) at a common reference month, then flags
// where SUPPLY and DEMAND are diverging — the "so what" institutional insight.
//
// Reference month = the latest month BOTH feeds fully cover (transactions lags,
// so we use its latest complete month). Signals are year-over-year on both sides.
//
// Run: node src/crosssignal.mjs

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SOURCES, buildUrl, soqlQuery, fetchDatasetMeta } from './lib/socrata.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'data', 'processed', 'crosssignal.json');

const DOB = SOURCES.dobNowBuild.id;      // w9ak-ipjd (property zip = postcode)
const ROLL = SOURCES.salesRolling.id;    // usep-8jbt
const ANN = SOURCES.salesAnnual.id;      // w2pb-icbu
const SPLIT = '2026-01-01';
const PRICE_MIN = 10000;
const LAG_MONTHS = 2;
const THRESH = 0.15;                      // ±15% YoY = a real move
const WINDOW = 3;                         // trailing-quarter window (smooths sparse zip data)
const MIN_DEV = 8;                        // min filings (current quarter) for a supply signal
const MIN_TX = 45;                        // min sales (current quarter) for a demand signal
const MIN_DEV_YA = 4;                     // min filings a year ago (so YoY isn't off a tiny base)
const MIN_TX_YA = 25;                     // min sales a year ago

const BORO = { 1: 'Manhattan', 2: 'Bronx', 3: 'Brooklyn', 4: 'Queens', 5: 'Staten Island' };
const zip5 = (z) => String(z || '').trim().slice(0, 5);
const monthKey = (v) => String(v || '').slice(0, 7);
const stepMonth = (k, d) => { let [y, m] = k.split('-').map(Number); m += d; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
const shiftYear = (k, d) => { const [y, m] = k.split('-'); return `${Number(y) + d}-${m}`; };
const monthLabel = (k) => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }); };
// trailing WINDOW-month window ENDING at month mk (inclusive)
const win = (mk) => ({ start: `${stepMonth(mk, -(WINDOW - 1))}-01`, end: `${stepMonth(mk, 1)}-01` });
const qtrLabel = (mk) => `${monthLabel(stepMonth(mk, -(WINDOW - 1)))}–${monthLabel(mk)}`.replace(/ \d{4}–/, m => m); // e.g. "March 2026–May 2026"

async function countByZip(datasetId, field, where) {
  const { rows } = await soqlQuery(datasetId, {
    $select: `${field} as zip,count(*) as n`,
    $where: `${where} AND ${field} IS NOT NULL`,
    $group: field, $limit: '5000',
  });
  const m = {};
  for (const r of rows) { const z = zip5(r.zip); if (z.length === 5) m[z] = (m[z] || 0) + Number(r.n || 0); }
  return m;
}

async function main() {
  const rollMeta = await fetchDatasetMeta(ROLL);
  const ref = stepMonth(monthKey(rollMeta.dataUpdatedAt || new Date().toISOString()), -LAG_MONTHS);
  const yo = shiftYear(ref, -1);
  const rw = win(ref), yw = win(yo);
  console.log(`Cross-signal reference month: ${ref} (YoY vs ${yo})`);

  const nbWhere = (w) => `job_type='New Building' AND filing_date >= '${w.start}' AND filing_date < '${w.end}'`;
  const saleWhere = (w) => `sale_price::number > ${PRICE_MIN} AND sale_date >= '${w.start}' AND sale_date < '${w.end}'`;

  const [devCur, devYoy, txCur, txYoy] = await Promise.all([
    countByZip(DOB, 'postcode', nbWhere(rw)),
    countByZip(DOB, 'postcode', nbWhere(yw)),
    countByZip(ROLL, 'zip_code', saleWhere(rw)),   // ref month is >= SPLIT → rolling
    countByZip(ANN, 'zip_code', saleWhere(yw)),    // year-ago → annualized
  ]);

  // zip → { borough, neighborhood } label from the ref-month sales rows
  const { rows: labelRows } = await soqlQuery(ROLL, {
    $select: 'zip_code as zip,borough,neighborhood,count(*) as n',
    $where: saleWhere(rw) + ' AND zip_code IS NOT NULL AND neighborhood IS NOT NULL',
    $group: 'zip_code,borough,neighborhood', $order: 'n DESC', $limit: '5000',
  });
  const label = {};
  for (const r of labelRows) { const z = zip5(r.zip); if (!label[z]) label[z] = { borough: BORO[Number(r.borough)] || '', neighborhood: r.neighborhood }; }

  const classify = (dev, tx) => {
    const su = dev >= THRESH, sd = dev <= -THRESH, du = tx >= THRESH, dd = tx <= -THRESH;
    if (su && dd) return 'Supply building, demand softening';
    if (sd && du) return 'Demand outpacing supply';
    if (su && du) return 'Heating';
    if (sd && dd) return 'Cooling';
    return 'Mixed / flat';
  };

  const zips = [];
  for (const z of Object.keys(devCur)) {
    const dCur = devCur[z] || 0, dYoy = devYoy[z] || 0, tCur = txCur[z] || 0, tYoy = txYoy[z] || 0;
    if (dCur < MIN_DEV || tCur < MIN_TX || dYoy < MIN_DEV_YA || tYoy < MIN_TX_YA) continue; // both signals must be off real bases
    const devYoY = (dCur - dYoy) / dYoy;
    const txYoY = (tCur - tYoy) / tYoy;
    const cls = classify(devYoY, txYoY);
    zips.push({
      zip: z, borough: (label[z] || {}).borough || '', neighborhood: (label[z] || {}).neighborhood || '',
      devCur: dCur, devYoY, txCur: tCur, txYoY, cls,
      divergence: Math.abs(devYoY - txYoY),
      devEvidence: buildUrl(DOB, { $select: 'job_filing_number,house_no,street_name,postcode,proposed_dwelling_units,filing_date', $where: nbWhere(rw) + ` AND postcode='${z}'`, $order: 'proposed_dwelling_units::number DESC' }),
      txEvidence: buildUrl(ROLL, { $select: 'address,neighborhood,sale_price,sale_date', $where: saleWhere(rw) + ` AND zip_code='${z}'`, $order: 'sale_price::number DESC' }),
    });
  }
  zips.sort((a, b) => b.divergence - a.divergence);

  const counts = {};
  for (const z of zips) counts[z.cls] = (counts[z.cls] || 0) + 1;
  const oversupply = zips.filter((z) => z.cls === 'Supply building, demand softening').slice(0, 8);
  const tightening = zips.filter((z) => z.cls === 'Demand outpacing supply').slice(0, 8);

  const out = {
    meta: {
      product: 'Urban Update', feed: 'Cross-Signal',
      generatedAt: new Date().toISOString(),
      referenceMonth: ref, referenceMonthLabel: monthLabel(ref), yoyMonthLabel: monthLabel(yo),
      windowLabel: qtrLabel(ref), windowMonths: WINDOW,
      join: 'DOB property ZIP (postcode) ⋈ DOF sale ZIP (zip_code)',
      sources: [
        { label: SOURCES.dobNowBuild.label, datasetId: DOB, landing: SOURCES.dobNowBuild.landing },
        { label: SOURCES.salesRolling.label, datasetId: ROLL, landing: SOURCES.salesRolling.landing },
        { label: SOURCES.salesAnnual.label, datasetId: ANN, landing: SOURCES.salesAnnual.landing },
      ],
      method: {
        signal: `Year-over-year change in the trailing ${WINDOW} months (${qtrLabel(ref)} vs. the same period a year earlier) in New Building filings (supply) and recorded sales (demand), joined by property ZIP.`,
        threshold: `A move of ±${THRESH * 100}% YoY counts as up/down. To qualify, a ZIP needs ≥${MIN_DEV} filings and ≥${MIN_TX} sales this quarter, each off a year-ago base of ≥${MIN_DEV_YA} / ≥${MIN_TX_YA} (avoids small-number noise).`,
        note: 'Supply and demand use the same trailing quarter (transactions lag ~2 months, so that quarter governs). Divergence flags are computed facts; interpretation requires review.',
      },
    },
    counts, oversupply, tightening, zips,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2));
  console.log(`Qualifying ZIPs: ${zips.length} | oversupply-watch: ${oversupply.length} | tightening: ${tightening.length}`);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
