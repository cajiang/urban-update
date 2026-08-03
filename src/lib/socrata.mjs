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
};

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
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
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
