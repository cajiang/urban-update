// Urban Update — Demand & Affordability feed (8th tab).
//
// Combines U.S. Census ACS 5-year data (household income, gross rent, home value,
// tenure, renter cost burden, income distribution) — by ZCTA (ZIP), NYC county
// (borough), and NYC city (citywide) — with two signals already in our pipeline:
// the DOF median sale price (transactions.json) and the FRED 30-year mortgage
// rate (capital.json). From these it computes:
//
//   (1) Affordability engine — income required to buy the median-priced home at
//       today's mortgage rate vs. the local median household income, plus the
//       estimated share of local households who could afford it.
//   (2) Divergence monitor — home-value vs. income vs. rent growth (2020→2024),
//       classified into supported-growth / yield-compression / affordability-
//       stress / improving-fundamentals (the interview #6 matrix).
//   (3) Renter cost burden — share of renters paying ≥30% (and ≥50%) of income.
//
// Answers the product's core affordability question: is price growth supported by
// incomes, or fragile? Requires a free CENSUS_API_KEY (env only; see D31). If the
// key is absent the step skips gracefully (writes a stub so the build still runs).
//
// Evidence standard: every ACS figure traces to api.census.gov; the affordability
// math is transparent and its assumptions are disclosed inline and in-dashboard.
//
// Run: node src/demand.mjs   (needs CENSUS_API_KEY in the environment)

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SOURCES, soqlQuery, fetchDatasetMeta } from './lib/socrata.mjs';
import {
  CENSUS, VINTAGES, ACS_VARS, INCOME_BRACKETS, INCOME_TOTAL_VAR,
  BOROUGH_COUNTIES, allVars, hasKey, fetchACS, fetchACSCounties, fetchACSCity,
} from './lib/census.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROCESSED = join(__dirname, '..', 'data', 'processed');
const OUT = join(PROCESSED, 'demand.json');

// ---- affordability assumptions (all disclosed in the dashboard) ----
const DOWN_PAYMENT = 0.20;   // 20% down → 80% LTV
const DTI = 0.30;            // 30% of gross income to housing (P&I)
const TERM_MONTHS = 360;     // 30-year fixed
const PARETO_ALPHA = 2.0;    // top open-income-bracket ($200k+) tail exponent

// ZIP display gates — ACS ZCTA estimates get noisy on tiny populations.
const MIN_POP = 1500;
const MIN_HH = 500;

const BORO_BY_FIPS = Object.fromEntries(BOROUGH_COUNTIES.map((c) => [c.fips, c.borough]));
const DOF_BORO = { 1: 'Manhattan', 2: 'Bronx', 3: 'Brooklyn', 4: 'Queens', 5: 'Staten Island' };

const pct = (x) => (x == null ? null : Math.round(x * 1000) / 10);           // → 1 decimal %
const round = (x, d = 0) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

// Public data.census.gov profile links (human-facing evidence; never carry the
// API key). ZCTA = summary level 860; county = 050; place = 160.
const zctaUrl = (zip) => `https://data.census.gov/profile?g=860XX00US${zip}`;
const countyUrl = (fips) => `https://data.census.gov/profile?g=050XX00US36${fips}`;
const CITY_URL = 'https://data.census.gov/profile?g=160XX00US3651000';

// ---------- affordability math ----------
function monthlyPI(loan, annualRatePct, n = TERM_MONTHS) {
  const m = annualRatePct / 100 / 12;
  if (m === 0) return loan / n;
  const f = Math.pow(1 + m, n);
  return (loan * m * f) / (f - 1);
}
// Annual gross income required to buy `price` at `ratePct`, under the disclosed
// down-payment / DTI / term assumptions. P&I only (excludes taxes, insurance,
// HOA/maintenance) — so this is a floor; true required income is higher.
function incomeRequired(price, ratePct) {
  if (!price || price <= 0) return null;
  const loan = price * (1 - DOWN_PAYMENT);
  return (monthlyPI(loan, ratePct) * 12) / DTI;
}
// Estimated share of households with income ≥ threshold, from the B19001
// distribution: uniform within finite brackets; Pareto tail (α) for the open
// $200k+ bracket. Returns a fraction 0..1.
function shareAtOrAbove(threshold, brackets, total) {
  if (!total || threshold == null) return null;
  let above = 0;
  for (const b of brackets) {
    if (b.count == null) continue;
    if (threshold <= b.lo) { above += b.count; continue; }
    if (!Number.isFinite(b.hi)) {                     // open-topped $200k+
      above += b.count * Math.pow(b.lo / threshold, PARETO_ALPHA);
      continue;
    }
    if (threshold >= b.hi) continue;                  // none in this finite bracket
    above += b.count * (b.hi - threshold) / (b.hi - b.lo);   // partial (uniform)
  }
  return above / total;
}

// ---------- ACS record → derived affordability/burden/growth object ----------
// `cur`/`prior` are the ACS variable maps for the two vintages; `price` is the
// home price used for the engine (DOF transacted median at borough/city grain;
// ACS median value at ZIP grain), `priceBasis` labels it.
function derive(cur, prior, price, priceBasis, rate) {
  if (!cur) return null;
  const income = cur[ACS_VARS.medianIncome];
  const rent = cur[ACS_VARS.medianRent];
  const value = cur[ACS_VARS.medianValue];
  const pop = cur[ACS_VARS.population];
  const renters = cur[ACS_VARS.tenureRenter];
  const owners = cur[ACS_VARS.tenureOwner];
  const hh = cur[ACS_VARS.tenureTotal];

  // Renter cost burden — denominator = renters with a computed rent/income ratio.
  const burdened = [ACS_VARS.rentPct30to35, ACS_VARS.rentPct35to40, ACS_VARS.rentPct40to50, ACS_VARS.rentPct50plus]
    .reduce((s, k) => s + (cur[k] || 0), 0);
  const severe = cur[ACS_VARS.rentPct50plus];
  const computedRenters = (cur[ACS_VARS.rentPctTotal] || 0) - (cur[ACS_VARS.rentPctNotComputed] || 0);
  const rentBurdenShare = computedRenters > 0 ? burdened / computedRenters : null;
  const severeBurdenShare = computedRenters > 0 ? severe / computedRenters : null;

  // Affordability engine.
  const enginePrice = price != null ? price : value;   // fall back to ACS value
  const reqIncome = incomeRequired(enginePrice, rate);
  const gapRatio = (reqIncome && income) ? reqIncome / income : null;   // ×median income
  const brackets = INCOME_BRACKETS.map((b) => ({ lo: b.lo, hi: b.hi, count: cur[b.v] }));
  const totalHH = cur[INCOME_TOTAL_VAR];
  const canAfford = reqIncome != null ? shareAtOrAbove(reqIncome, brackets, totalHH) : null;

  // Growth (2020→2024) — same ACS source, same window, same geography vintage.
  const g = (k) => (prior && prior[k] != null && prior[k] !== 0 && cur[k] != null) ? (cur[k] - prior[k]) / prior[k] : null;
  const incomeGrowth = g(ACS_VARS.medianIncome);
  const rentGrowth = g(ACS_VARS.medianRent);
  const valueGrowth = g(ACS_VARS.medianValue);
  const popGrowth = g(ACS_VARS.population);

  return {
    income, rent, value, pop, owners, renters, hh,
    tenureRenterShare: hh > 0 ? renters / hh : null,
    rentBurdenShare, severeBurdenShare, burdenedRenters: burdened, computedRenters,
    engine: {
      price: enginePrice, priceBasis, rate,
      incomeRequired: reqIncome ? Math.round(reqIncome) : null,
      gapRatio: round(gapRatio, 2),
      shareCanAfford: canAfford,
    },
    growth: { income: incomeGrowth, rent: rentGrowth, value: valueGrowth, pop: popGrowth },
    divergence: classifyDivergence({ incomeGrowth, rentGrowth, valueGrowth }),
  };
}

// ---------- divergence monitor (interview #6 matrix) ----------
// Classifies an area by how home-value, rent, and income growth diverge over the
// 2020→2024 window. Thresholds are in growth-rate points over the window; the
// three growth numbers travel with the label so the call is fully transparent.
// All thresholds are cumulative growth-rate gaps over the 2020→2024 window (pts).
const DIV_STRESS = 0.05;     // rent growth − income growth ≥ 5 pts → affordability stress
const DIV_SPEC = 0.10;       // value growth − rent growth ≥ 10 pts → yield compression
const DIV_FUND = 0.10;       // income growth − value growth ≥ 10 pts → improving fundamentals
const DIV_TOGETHER = 0.10;   // |value growth − income growth| < 10 pts → moving together
function classifyDivergence({ incomeGrowth, rentGrowth, valueGrowth }) {
  if (incomeGrowth == null || rentGrowth == null || valueGrowth == null) {
    return { cls: 'Insufficient data', code: 'na' };
  }
  const rentVsIncome = rentGrowth - incomeGrowth;
  const valueVsRent = valueGrowth - rentGrowth;
  const valueVsIncome = valueGrowth - incomeGrowth;
  // Priority: affordability stress (most socially salient) → yield compression →
  // improving fundamentals → supported growth → mixed. The three growth numbers
  // travel with the label so the call is fully transparent.
  if (rentVsIncome >= DIV_STRESS) {
    return { cls: 'Affordability stress', code: 'stress',
      note: 'Rents are outrunning incomes — affordability & political risk.' };
  }
  if (valueVsRent >= DIV_SPEC && valueGrowth > 0) {
    return { cls: 'Yield compression', code: 'spec',
      note: 'Home values are outrunning rents — thinner yields / speculative pricing.' };
  }
  if (-valueVsIncome >= DIV_FUND) {   // incomes outrunning values
    return { cls: 'Improving fundamentals', code: 'fund',
      note: 'Incomes are rising faster than values — strengthening, not stretched.' };
  }
  if (valueGrowth > 0 && incomeGrowth > 0 && Math.abs(valueVsIncome) < DIV_TOGETHER) {
    return { cls: 'Supported growth', code: 'supported',
      note: 'Values and incomes are rising together — growth backed by purchasing power.' };
  }
  return { cls: 'Mixed', code: 'mixed', note: 'No single divergence dominates.' };
}

// ---------- DOF ZIP→borough universe ----------
// The NYC ZIP set (with borough labels) comes from DOF recorded sales — the same
// ZIP-keyed transactional universe our other feeds join on. A ZIP can appear under
// more than one borough code (data noise); assign the borough with the most sales.
async function fetchZipUniverse() {
  const { rows } = await soqlQuery(SOURCES.salesRolling.id, {
    $select: 'zip_code, borough, count(*) as n',
    $where: `zip_code IS NOT NULL AND sale_price::number > 10000`,
    $group: 'zip_code, borough', $limit: '5000',
  });
  const best = {};   // zip -> { borough, n }
  for (const r of rows) {
    const zip = String(r.zip_code || '').trim();
    if (!/^\d{5}$/.test(zip)) continue;
    if (!(zip.startsWith('10') || zip.startsWith('11'))) continue;   // NYC ZIP space
    const boro = DOF_BORO[r.borough];
    if (!boro) continue;
    const n = Number(r.n || 0);
    if (!best[zip] || n > best[zip].n) best[zip] = { borough: boro, n };
  }
  return best;   // { zip: { borough, n } }
}

// ---------- main ----------
async function main() {
  if (!hasKey()) {
    // Mirror narrate.mjs: skip gracefully WITHOUT clobbering a good demand.json.
    // Only write a stub if none exists yet, so a keyless refresh never destroys
    // previously-built affordability data.
    const existing = await readFile(OUT, 'utf8').then(() => true).catch(() => false);
    if (existing) {
      console.log('CENSUS_API_KEY not set — skipping Demand & Affordability build (existing demand.json kept).');
    } else {
      console.log('CENSUS_API_KEY not set — no demand.json yet; writing a stub so the build still runs.');
      await writeStub('CENSUS_API_KEY not set at build time.');
    }
    return;
  }

  // Reused pipeline inputs: FRED 30Y mortgage + DOF median sale prices.
  const capital = JSON.parse(await readFile(join(PROCESSED, 'capital.json'), 'utf8'));
  const mortgage = capital.rates.find((r) => r.id === 'MORTGAGE30US');
  const rate = mortgage.latest.value;
  const rateAsOf = mortgage.latest.date;
  const tx = JSON.parse(await readFile(join(PROCESSED, 'transactions.json'), 'utf8'));
  const dofByBoro = Object.fromEntries(tx.boroughs.map((b) => [b.name, b.latest.med]));
  const dofCity = tx.citywide.latest.med;
  const dofAsOf = tx.meta.latestMonthLabel;

  console.log(`Rate (FRED 30Y): ${rate}% as of ${rateAsOf}; DOF price as of ${dofAsOf}.`);

  // ZIP universe from DOF, then ACS for both vintages.
  console.log('Fetching DOF ZIP→borough universe…');
  const universe = await fetchZipUniverse();
  const zips = Object.keys(universe).sort();
  console.log(`  ${zips.length} NYC ZIPs.`);

  const vars = allVars();
  console.log(`Fetching ACS5 ${VINTAGES.current} & ${VINTAGES.prior} for ${zips.length} ZIPs, 5 boroughs, citywide…`);
  const [zipCur, zipPrior, boroCur, boroPrior, cityCur, cityPrior] = await Promise.all([
    fetchACS(VINTAGES.current, zips, vars),
    fetchACS(VINTAGES.prior, zips, vars),
    fetchACSCounties(VINTAGES.current, vars),
    fetchACSCounties(VINTAGES.prior, vars),
    fetchACSCity(VINTAGES.current, vars),
    fetchACSCity(VINTAGES.prior, vars),
  ]);
  console.log(`  ACS calls: zips ${zipCur.calls}+${zipPrior.calls}, counties 1+1, city 1+1.`);

  // ---- per-ZIP (engine on ACS median home value; per-ZIP DOF medians too thin) ----
  const zipRows = [];
  let dropped = 0;
  for (const zip of zips) {
    const cur = zipCur.data[zip];
    if (!cur || cur[ACS_VARS.population] == null) { dropped++; continue; }
    if ((cur[ACS_VARS.population] || 0) < MIN_POP || (cur[ACS_VARS.tenureTotal] || 0) < MIN_HH) { dropped++; continue; }
    const d = derive(cur, zipPrior.data[zip], cur[ACS_VARS.medianValue], 'ACS median home value', rate);
    if (!d || d.engine.incomeRequired == null) { dropped++; continue; }
    zipRows.push({ zip, borough: universe[zip].borough, censusUrl: zctaUrl(zip), ...d });
  }
  zipRows.sort((a, b) => (b.engine.gapRatio || 0) - (a.engine.gapRatio || 0));
  console.log(`  ${zipRows.length} ZIPs kept (${dropped} dropped: no ACS / below pop ${MIN_POP} / hh ${MIN_HH}).`);

  // ---- per-borough (engine on DOF transacted median sale price) ----
  const boroughs = BOROUGH_COUNTIES.map(({ borough, fips }) => {
    const d = derive(boroCur[fips], boroPrior[fips], dofByBoro[borough], 'DOF median sale price', rate);
    return { borough, fips, dofMedianPrice: dofByBoro[borough], censusUrl: countyUrl(fips), ...d };
  });

  // ---- citywide ----
  const city = derive(cityCur, cityPrior, dofCity, 'DOF median sale price', rate);

  // ---- divergence tallies (for the monitor summary) ----
  const tally = {};
  for (const r of zipRows) tally[r.divergence.code] = (tally[r.divergence.code] || 0) + 1;

  const out = {
    meta: {
      product: 'Urban Update', feed: 'Demand & Affordability',
      generatedAt: new Date().toISOString(),
      vintages: { current: VINTAGES.current, prior: VINTAGES.prior },
      source: {
        label: CENSUS.label, host: CENSUS.host, publisher: CENSUS.publisher,
        provenance: CENSUS.provenance, landing: CENSUS.landing,
        datasetId: `ACS 5-Year ${VINTAGES.current} & ${VINTAGES.prior} (ZCTA, county, place)`,
        updateFrequency: 'Annual (5-year estimates)',
        dataUpdatedAt: `${VINTAGES.current}-12-31`,
        note: 'ZCTA (ZIP) grain; both vintages use 2020-Census ZCTA boundaries for a consistent change window.',
        variables: 'B19013 income · B25064 gross rent · B25077 home value · B01003 population · B25003 tenure · B25070 rent burden · B19001 income distribution',
      },
      combinedWith: [
        { label: 'DOF median sale price', via: 'transactions.json', asOf: dofAsOf },
        { label: 'FRED 30-year fixed mortgage', via: 'capital.json', value: rate, asOf: rateAsOf },
      ],
      assumptions: {
        downPayment: DOWN_PAYMENT, dtiHousing: DTI, termMonths: TERM_MONTHS,
        mortgageRatePct: rate,
        note: `Income required to buy = gross income at which principal & interest on an ${Math.round((1 - DOWN_PAYMENT) * 100)}% -LTV ${TERM_MONTHS / 12}-year fixed at ${rate}% equals ${Math.round(DTI * 100)}% of income. Excludes taxes, insurance, and maintenance — so it is a floor. "Share who can afford" interpolates the ACS income distribution (uniform within brackets; Pareto α=${PARETO_ALPHA} above $200k) and is an estimate.`,
      },
      method: {
        engine: 'Local median home price × current mortgage rate → monthly P&I → annual income required at 30% DTI → gap vs. ACS median household income + estimated share of households who can afford it. Borough/citywide use the DOF transacted median sale price; ZIP grain uses ACS median home value (per-ZIP transaction medians are too thin to be reliable).',
        divergence: `Home-value vs. income vs. rent growth over ${VINTAGES.prior}→${VINTAGES.current} (ACS, same source/window/geography). Affordability stress = rent growth − income growth ≥ ${DIV_STRESS * 100}pts; yield compression = value growth − rent growth ≥ ${DIV_SPEC * 100}pts; improving fundamentals = income growth ≥ ${DIV_FUND * 100}pts with values ~flat; supported growth = values & incomes rising together.`,
        burden: 'Renter cost burden = share of renter households (with a computed rent/income ratio) paying ≥30% of income on gross rent (severe = ≥50%). ACS table B25070.',
        disclosure: 'ACS 5-year estimates are period averages lagged ~1–1.5 years and carry sampling error at ZIP grain; figures are conditions to investigate, not point forecasts. Affordability assumptions are disclosed above; the linkage of rates→affordability is arithmetic, the market interpretation is inference. At ZIP grain the engine treats ACS median home value as a market price; for limited-equity / regulated cooperatives (e.g., Co-op City, ZIP 10475) that value is a below-market regulated share price, so their ownership-affordability read is not comparable to market-rate areas.',
      },
    },
    rate: { value: rate, asOf: rateAsOf, series: 'MORTGAGE30US' },
    city: city ? { name: 'New York City', dofMedianPrice: dofCity, censusUrl: CITY_URL, ...city } : null,
    boroughs,
    zips: zipRows,
    divergenceTally: tally,
    coverage: { zipsQueried: zips.length, zipsKept: zipRows.length, minPop: MIN_POP, minHouseholds: MIN_HH },
  };

  await mkdir(PROCESSED, { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2));
  console.log(`\nCitywide: median income $${city.income?.toLocaleString()}, income required $${city.engine.incomeRequired?.toLocaleString()} (${city.engine.gapRatio}× median), ~${pct(city.engine.shareCanAfford)}% can afford.`);
  console.log(`Divergence tally: ${Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  console.log(`Wrote ${OUT}`);
}

async function writeStub(reason) {
  const stub = {
    meta: {
      product: 'Urban Update', feed: 'Demand & Affordability',
      generatedAt: new Date().toISOString(), skipped: true, reason,
    },
    city: null, boroughs: [], zips: [], divergenceTally: {},
  };
  await mkdir(PROCESSED, { recursive: true });
  await writeFile(OUT, JSON.stringify(stub, null, 2));
  console.log(`Wrote stub ${OUT} (${reason})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
