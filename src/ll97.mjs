// Urban Update — Local Law 97 carbon-penalty exposure model.
// Estimates each covered building's LL97 emissions-limit exceedance and the
// resulting annual penalty ($268 / metric ton CO2e over the limit), for the
// 2024–2029 and 2030–2034 compliance periods, then aggregates by ZIP/borough.
//
// Source: NYC Building Energy & Water Data Disclosure (LL84 benchmarking),
// dataset 5zyy-y8am (DOB, official, annual). We use the latest report year.
//
// METHOD (transparent, disclosed): building emissions = reported total
// location-based GHG (tCO2e); limit = (intensity limit for the building's
// PRIMARY occupancy group) × gross floor area. Using the primary property type
// approximates a rigorous multi-occupancy calculation; it is a screening
// estimate, not a compliance filing.
//
// Run: node src/ll97.mjs

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { soqlQuery, fetchDatasetMeta } from './lib/socrata.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'data', 'processed', 'll97.json');
const DS = '5zyy-y8am';
const PENALTY = 268;        // $/tCO2e over the limit, per year
const MIN_GFA = 25000;      // LL97 coverage threshold (sq ft)

// LL97 emissions-intensity limits (tCO2e / sq ft / yr) by occupancy group:
// [2024–2029, 2030–2034]. Source: NYC Admin Code §28-320 / DOB LL97 rules.
const LIM = {
  A: [0.01074, 0.00420], B: [0.00846, 0.00453], E: [0.00758, 0.00344],
  F: [0.00574, 0.00167], H: [0.02381, 0.01133], I1: [0.01138, 0.00598],
  I2: [0.02381, 0.01133], I4: [0.00758, 0.00344], M: [0.01181, 0.00403],
  R1: [0.00987, 0.00526], R2: [0.00675, 0.00407], S: [0.00426, 0.00110],
  U: [0.00426, 0.00110],
};
// Energy Star primary property type → occupancy group (top types; default B).
const GROUP = {
  'Multifamily Housing': 'R2', 'Residence Hall/Dormitory': 'R2', 'Senior Living Community': 'R2',
  'Mixed Use Property': 'R2', 'Hotel': 'R1', 'Office': 'B', 'Financial Office': 'B',
  'Medical Office': 'B', 'Bank Branch': 'B', 'K-12 School': 'E', 'College/University': 'E',
  'Adult Education': 'E', 'Retail Store': 'M', 'Enclosed Mall': 'M', 'Strip Mall': 'M',
  'Supermarket/Grocery Store': 'M', 'Wholesale Club/Supercenter': 'M', 'Automobile Dealership': 'M',
  'Restaurant': 'A', 'Worship Facility': 'A', 'Museum': 'A', 'Performing Arts': 'A',
  'Movie Theater': 'A', 'Convention Center': 'A', 'Fitness Center/Health Club/Gym': 'A',
  'Non-Refrigerated Warehouse': 'S', 'Refrigerated Warehouse': 'S', 'Self-Storage Facility': 'S',
  'Distribution Center': 'S', 'Manufacturing/Industrial Plant': 'F',
  'Hospital (General Medical & Surgical)': 'I2', 'Residential Care Facility': 'I1',
};
const groupOf = (t) => GROUP[t] || 'B';

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const zip5 = (z) => String(z || '').trim().slice(0, 5);
const nf = (n) => Number(n || 0).toLocaleString('en-US');
const money = (n) => n >= 1e9 ? '$' + (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : '$' + nf(Math.round(n));
const BOROS = ['Manhattan', 'Bronx', 'Brooklyn', 'Queens', 'Staten Island'];
const titleBoro = (s) => { const t = String(s || '').trim().toLowerCase(); return BOROS.find((b) => b.toLowerCase() === t) || null; };
// Borough from BBL first digit (reliable; the text `borough` field is often null).
const BB = { 1: 'Manhattan', 2: 'Bronx', 3: 'Brooklyn', 4: 'Queens', 5: 'Staten Island' };
const boroughFromBBL = (bbl) => BB[Number(String(bbl || '').replace(/\D/g, '')[0])] || null;
const MAX_INTENSITY = 0.05;  // tCO2e/sqft — above ~50 kg/sqft is almost certainly a reporting error
const MAX_GHG = 200000;      // tCO2e — no single NYC building is near this; filters bad rows

async function main() {
  // latest report year
  const { rows: yrs } = await soqlQuery(DS, { $select: 'report_year,count(*) as n', $group: 'report_year', $order: 'report_year DESC', $limit: '5' });
  const year = yrs[0].report_year;
  console.log(`LL97 model — report year ${year}`);

  const { rows } = await soqlQuery(DS, {
    $select: 'nyc_borough_block_and_lot as bbl,address_1 as address,postal_code as zip,borough,primary_property_type as ptype,property_gfa_calculated as gfa,total_location_based_ghg as ghg',
    $where: `report_year='${year}' AND property_gfa_calculated IS NOT NULL AND total_location_based_ghg IS NOT NULL`,
    $limit: '60000',
  });

  const buildings = [];
  let dropped = 0;
  for (const r of rows) {
    const gfa = num(r.gfa), ghg = num(r.ghg);
    if (gfa < MIN_GFA || ghg <= 0) continue;
    const intensity = ghg / gfa;
    if (intensity > MAX_INTENSITY || ghg > MAX_GHG) { dropped++; continue; } // data-entry outliers
    const borough = boroughFromBBL(r.bbl) || titleBoro(r.borough);
    if (!borough) continue;
    const g = groupOf(r.ptype);
    const [i24, i30] = LIM[g];
    const over24 = Math.max(0, ghg - i24 * gfa), over30 = Math.max(0, ghg - i30 * gfa);
    buildings.push({
      bbl: r.bbl, address: (r.address || '').trim(), zip: zip5(r.zip), borough,
      ptype: r.ptype, gfa, ghg, intensity, group: g,
      pen24: over24 * PENALTY, pen30: over30 * PENALTY,
      over24: over24 > 0, over30: over30 > 0,
    });
  }
  console.log(`Dropped ${dropped} outlier rows (intensity > ${MAX_INTENSITY} tCO2e/sqft or GHG > ${nf(MAX_GHG)})`);

  const agg = (list) => list.reduce((a, b) => {
    a.covered++; a.gfa += b.gfa; a.pen24 += b.pen24; a.pen30 += b.pen30;
    if (b.over24) a.over24++; if (b.over30) a.over30++; return a;
  }, { covered: 0, gfa: 0, pen24: 0, pen30: 0, over24: 0, over30: 0 });

  // by ZIP
  const zipMap = {};
  for (const b of buildings) { if (b.zip.length === 5 && b.borough) (zipMap[b.zip] ||= { zip: b.zip, borough: b.borough, list: [] }).list.push(b); }
  const zips = Object.values(zipMap).map((z) => ({ zip: z.zip, borough: z.borough, ...agg(z.list) }));

  // by borough (+ zip drill-down)
  const boroughs = BOROS.map((name) => {
    const list = buildings.filter((b) => b.borough === name);
    const zs = zips.filter((z) => z.borough === name).sort((a, b) => b.pen24 - a.pen24)
      .map((z) => ({ ...z, pct24: z.covered ? z.over24 / z.covered : 0, pct30: z.covered ? z.over30 / z.covered : 0,
        evidenceUrl: `https://data.cityofnewyork.us/resource/${DS}.json?$where=postal_code='${z.zip}' AND report_year='${year}' AND property_gfa_calculated>'25000'` }));
    const a = agg(list);
    return { name, ...a, pct24: a.covered ? a.over24 / a.covered : 0, pct30: a.covered ? a.over30 / a.covered : 0, neighborhoods: zs, neighborhoodCount: zs.length };
  });

  const city = agg(buildings);
  const seenB = new Set();
  const topBuildings = buildings.slice().sort((a, b) => b.pen24 - a.pen24)
    .filter((b) => { const k = (b.address || b.bbl).toUpperCase(); if (seenB.has(k)) return false; seenB.add(k); return true; })
    .slice(0, 10)
    .map((b) => ({ address: b.address, zip: b.zip, borough: b.borough, ptype: b.ptype, gfa: b.gfa, pen24: b.pen24, pen30: b.pen30 }));

  const out = {
    meta: {
      product: 'Urban Update', feed: 'Local Law 97', reportYear: year, generatedAt: new Date().toISOString(),
      source: { label: 'NYC Building Energy & Water Data Disclosure (LL84)', datasetId: DS, landing: `https://data.cityofnewyork.us/d/${DS}`, ...(await fetchDatasetMeta(DS)) },
      method: {
        baseline: `Estimated annual LL97 penalty = $${PENALTY} × metric tons CO2e over the building's emissions limit. Limit = (intensity limit for the primary occupancy group) × gross floor area. Covered = buildings ≥ ${nf(MIN_GFA)} sq ft.`,
        threshold: 'Two compliance periods shown: 2024–2029 (penalties in effect now) and 2030–2034 (limits tighten sharply).',
        note: 'Screening estimate, not a compliance filing: uses reported location-based GHG and the primary property type (a rigorous calc sums limits across every occupancy in the building). Figures trace to primary DOB benchmarking data; consult a qualified professional for compliance.',
      },
    },
    citywide: { ...city, pct24: city.covered ? city.over24 / city.covered : 0, pct30: city.covered ? city.over30 / city.covered : 0 },
    boroughs, topBuildings,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2));
  console.log(`Covered: ${nf(city.covered)} | over 2024 limit: ${nf(city.over24)} (${(city.over24 / city.covered * 100).toFixed(0)}%) | over 2030: ${nf(city.over30)} (${(city.over30 / city.covered * 100).toFixed(0)}%)`);
  console.log(`Est. annual penalty — 2024 basis: ${money(city.pen24)} | 2030 basis: ${money(city.pen30)}`);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
