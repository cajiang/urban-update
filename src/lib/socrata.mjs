// Socrata (NYC Open Data) fetch helper + pinned source registry.
// Single source of truth for dataset IDs and query building. See ../../SOURCES.md.

export const SOURCES = {
  dobNowBuild: {
    id: 'w9ak-ipjd',
    label: 'DOB NOW: Build – Job Application Filings',
    host: 'data.cityofnewyork.us',
    landing:
      'https://data.cityofnewyork.us/Housing-Development/DOB-NOW-Build-Job-Application-Filings/w9ak-ipjd',
  },
  salesRolling: {
    id: 'usep-8jbt',
    label: 'NYC Citywide Rolling Calendar Sales',
    host: 'data.cityofnewyork.us',
    landing: 'https://data.cityofnewyork.us/City-Government/NYC-Citywide-Rolling-Calendar-Sales/usep-8jbt',
  },
  salesAnnual: {
    id: 'w2pb-icbu',
    label: 'NYC Citywide Annualized Calendar Sales Update',
    host: 'data.cityofnewyork.us',
    landing: 'https://data.cityofnewyork.us/City-Government/NYC-Citywide-Annualized-Calendar-Sales-Update/w2pb-icbu',
  },
};

// Resilient fetch: retries transient network failures (ECONNRESET, dropped
// connections, timeouts) and 429/5xx responses with exponential backoff. NYC
// Open Data occasionally resets connections under many rapid requests — common
// from CI runners — which would otherwise fail an entire refresh.
export async function fetchWithRetry(url, opts = {}, { tries = 4, baseDelay = 600 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts);
      if ([429, 500, 502, 503, 504].includes(res.status)) {
        lastErr = new Error(`HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (e) {
      lastErr = e;   // network-level failure (ECONNRESET, "fetch failed", timeout)
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, baseDelay * 2 ** i));
  }
  throw lastErr;
}

// Fetch a dataset's official metadata (provenance, publisher, update cadence, last refresh).
export async function fetchDatasetMeta(id) {
  let res;
  try { res = await fetchWithRetry(`https://data.cityofnewyork.us/api/views/${id}.json`); }
  catch { return {}; }
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
    attribution: m.attribution || null,
    provenance: m.provenance || null,
    updateFrequency: updateFrequency || null,
    dataUpdatedAt: m.rowsUpdatedAt ? new Date(m.rowsUpdatedAt * 1000).toISOString() : null,
  };
}

const BASE = (id) => `https://data.cityofnewyork.us/resource/${id}.json`;

// Build a Socrata API URL from a params object ($select, $where, etc.).
export function buildUrl(id, params = {}) {
  const u = new URL(BASE(id));
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, v);
  }
  return u.toString();
}

// Fetch JSON from Socrata with basic error surfacing (Socrata returns an
// object with `message` on error rather than an array).
export async function soqlQuery(id, params = {}) {
  const url = buildUrl(id, params);
  const res = await fetchWithRetry(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Socrata ${res.status} for ${url}\n${body.slice(0, 400)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`Socrata error for ${url}\n${JSON.stringify(data).slice(0, 400)}`);
  }
  return { rows: data, url };
}
