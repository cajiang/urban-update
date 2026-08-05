// U.S. Census — American Community Survey (ACS) 5-year fetch helper + variable
// registry. Single source of truth for ACS variable IDs and geography. See
// ../../SOURCES.md ("Demand & Affordability feed").
//
// Requires a free CENSUS_API_KEY in the environment (keyless ACS access is
// retired; see DECISIONS.md D31). The key is read from the environment only,
// never logged, never committed — the URL that carries it is never printed.
// If the key is absent, hasKey() returns false and callers skip gracefully.

// ---- source metadata (for the dashboard provenance panel) ----
export const CENSUS = {
  label: 'U.S. Census Bureau — American Community Survey (ACS) 5-Year Estimates',
  host: 'api.census.gov',
  publisher: 'U.S. Census Bureau',
  provenance: 'official',
  landing: 'https://www.census.gov/programs-surveys/acs',
  apiBase: 'https://api.census.gov/data',
};

// ACS 5-year vintages we pull. Both use 2020-Census ZCTA boundaries, so the
// current↔prior change is measured on a consistent geography (pre-2020 ACS uses
// 2010 ZCTAs and would inject spurious change for re-drawn ZIPs — see the
// growth-window note in demand.mjs). ~4-year change window (2016–2020 5yr window
// vs 2020–2024 5yr window; they share only their 2020 endpoint).
export const VINTAGES = { current: 2024, prior: 2020 };

// The variable registry. Every ACS figure the feed ships traces to one of these.
// (E = estimate.) Verified live returning for NYC ZCTAs in ACS5 2024 & 2020.
export const ACS_VARS = {
  medianIncome: 'B19013_001E', // Median household income (past 12 months)
  medianRent:   'B25064_001E', // Median gross rent
  medianValue:  'B25077_001E', // Median value (owner-occupied units)
  population:   'B01003_001E', // Total population
  // Tenure (occupied housing units)
  tenureTotal:  'B25003_001E',
  tenureOwner:  'B25003_002E',
  tenureRenter: 'B25003_003E',
  // Gross rent as a % of household income (renter cost burden). Universe =
  // renter-occupied units paying cash rent with a computed ratio. Burdened
  // (≥30%) = 30–34.9 + 35–39.9 + 40–49.9 + 50%+. _011E = "not computed".
  rentPctTotal:     'B25070_001E',
  rentPct30to35:    'B25070_007E',
  rentPct35to40:    'B25070_008E',
  rentPct40to50:    'B25070_009E',
  rentPct50plus:    'B25070_010E',
  rentPctNotComputed: 'B25070_011E',
};

// Household income distribution (B19001) — 16 income brackets + total. Used to
// estimate the share of local households that can afford the median home.
// Upper bound of each bracket, in dollars ($200k+ is open-topped).
export const INCOME_BRACKETS = [
  { v: 'B19001_002E', lo: 0,      hi: 10000 },
  { v: 'B19001_003E', lo: 10000,  hi: 15000 },
  { v: 'B19001_004E', lo: 15000,  hi: 20000 },
  { v: 'B19001_005E', lo: 20000,  hi: 25000 },
  { v: 'B19001_006E', lo: 25000,  hi: 30000 },
  { v: 'B19001_007E', lo: 30000,  hi: 35000 },
  { v: 'B19001_008E', lo: 35000,  hi: 40000 },
  { v: 'B19001_009E', lo: 40000,  hi: 45000 },
  { v: 'B19001_010E', lo: 45000,  hi: 50000 },
  { v: 'B19001_011E', lo: 50000,  hi: 60000 },
  { v: 'B19001_012E', lo: 60000,  hi: 75000 },
  { v: 'B19001_013E', lo: 75000,  hi: 100000 },
  { v: 'B19001_014E', lo: 100000, hi: 125000 },
  { v: 'B19001_015E', lo: 125000, hi: 150000 },
  { v: 'B19001_016E', lo: 150000, hi: 200000 },
  { v: 'B19001_017E', lo: 200000, hi: Infinity },
];
export const INCOME_TOTAL_VAR = 'B19001_001E';

// The full flat list of variables to request (deduped).
export function allVars() {
  const base = Object.values(ACS_VARS);
  const inc = [INCOME_TOTAL_VAR, ...INCOME_BRACKETS.map((b) => b.v)];
  return [...new Set([...base, ...inc])];
}

// NYC boroughs are whole counties — fetch borough-grain ACS directly at county
// level (authoritative medians) rather than averaging ZIP medians. FIPS in NY
// state (36): Manhattan=New York 061, Bronx 005, Brooklyn=Kings 047,
// Queens 081, Staten Island=Richmond 085.
export const BOROUGH_COUNTIES = [
  { borough: 'Manhattan',     fips: '061' },
  { borough: 'Bronx',         fips: '005' },
  { borough: 'Brooklyn',      fips: '047' },
  { borough: 'Queens',        fips: '081' },
  { borough: 'Staten Island', fips: '085' },
];

export function hasKey() {
  return !!process.env.CENSUS_API_KEY;
}

// Census marks unavailable/suppressed estimates with large negative sentinels
// (-666666666, -999999999, …) or JSON null. Coerce those to null; keep genuine
// values (incl. legitimate top-codes like income 250,001 or value 2,000,001).
function cleanNum(raw) {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n <= -100000000) return null;
  return n;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Fetch ACS5 estimates for a set of ZCTAs in one vintage.
// Returns { data: { <zip>: { <var>: number|null } }, url count } — the URL is
// never returned or logged because it carries the API key.
// Batches ZCTAs comma-separated (chunked) to keep URLs short; ZCTAs are a
// national geography in 2020+ vintages, so no state nesting is needed.
export async function fetchACS(year, zips, vars, { batchSize = 40 } = {}) {
  if (!hasKey()) throw new Error('CENSUS_API_KEY not set');
  const key = process.env.CENSUS_API_KEY;
  const getList = vars.join(',');
  const data = {};
  let calls = 0;
  for (const grp of chunk(zips, batchSize)) {
    const geo = encodeURIComponent(grp.join(','));
    const url = `${CENSUS.apiBase}/${year}/acs/acs5`
      + `?get=${getList}`
      + `&for=${encodeURIComponent('zip code tabulation area')}:${geo}`
      + `&key=${key}`;
    const res = await fetch(url);
    calls++;
    if (!res.ok) {
      // Scrub the key before surfacing any error text.
      const body = (await res.text()).replaceAll(key, '«KEY»');
      throw new Error(`Census ${res.status} (ACS5 ${year}): ${body.slice(0, 300)}`);
    }
    const rows = await res.json(); // [ [header...], [values...], ... ]
    const header = rows[0];
    const zipIdx = header.indexOf('zip code tabulation area');
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const zip = row[zipIdx];
      const rec = {};
      for (let c = 0; c < header.length; c++) {
        if (c === zipIdx) continue;
        rec[header[c]] = cleanNum(row[c]);
      }
      data[zip] = rec;
    }
  }
  return { data, calls };
}

// Fetch ACS5 estimates for a summary level nested within NY state (36).
// geoType e.g. 'county' or 'place'; fipsList = array of FIPS strings.
// Returns { <fips>: { <var>: number|null } }. One call; URL carries the key and
// is never returned or logged.
async function fetchACSInState(year, geoType, fipsList, vars) {
  if (!hasKey()) throw new Error('CENSUS_API_KEY not set');
  const key = process.env.CENSUS_API_KEY;
  const url = `${CENSUS.apiBase}/${year}/acs/acs5`
    + `?get=${vars.join(',')}`
    + `&for=${encodeURIComponent(geoType)}:${fipsList.join(',')}`
    + `&in=${encodeURIComponent('state')}:36`
    + `&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = (await res.text()).replaceAll(key, '«KEY»');
    throw new Error(`Census ${res.status} (ACS5 ${year} ${geoType}): ${body.slice(0, 300)}`);
  }
  const rows = await res.json();
  const header = rows[0];
  const idIdx = header.indexOf(geoType);
  const out = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rec = {};
    for (let c = 0; c < header.length; c++) {
      if (header[c] === geoType || header[c] === 'state') continue;
      rec[header[c]] = cleanNum(row[c]);
    }
    out[row[idIdx]] = rec;
  }
  return out;
}

// Borough-grain ACS (NYC boroughs = whole counties). Returns { <countyFips>: {…} }.
export function fetchACSCounties(year, vars) {
  return fetchACSInState(year, 'county', BOROUGH_COUNTIES.map((c) => c.fips), vars);
}

// Citywide ACS — New York city is Census "place" 51000 in NY state. Returns the
// single record's variable map (or null if absent).
export async function fetchACSCity(year, vars) {
  const out = await fetchACSInState(year, 'place', ['51000'], vars);
  return out['51000'] || null;
}
