// Urban Update — LLM interpretation layer.
// Reads the five processed feeds, assembles a grounded evidence packet, and asks
// Claude to synthesize a daily intelligence brief + per-neighborhood spotlights.
// Writes data/processed/narratives.json for the dashboard's "Brief" tab.
//
// The model may use ONLY the numbers we pass it (no fabrication), and must keep
// fact separate from interpretation. Runs as part of the daily refresh.
//
// Requires ANTHROPIC_API_KEY in the environment. If it's not set, this step is
// skipped and the existing narratives.json (if any) is left in place, so the
// rest of the refresh still completes.
//
// Run: node src/narrate.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dir = join(__dirname, '..', 'data', 'processed');
const OUT = join(dir, 'narratives.json');

const MODEL = 'claude-opus-5';
const API = 'https://api.anthropic.com/v1/messages';

const read = async (f) => JSON.parse(await readFile(join(dir, f), 'utf8'));

// ---------- assemble a compact, grounded evidence packet ----------
function buildEvidence(dev, tx, risk, ll97, cross, capital) {
  const pctd = (x) => x == null ? null : Math.round(x * 100);
  return {
    as_of: {
      development: dev.meta.latestMonthLabel,
      transactions: tx.meta.latestMonthLabel,
      risk: risk.meta.windowLabel,
      ll97_report_year: ll97.meta.reportYear,
      cross_signal: cross.meta.windowLabel,
      capital: capital ? capital.rates[0].latest.date : null,
    },
    development: {
      citywide_filings: dev.citywide.latest.filings,
      citywide_units: dev.citywide.latest.units,
      citywide_yoy_pct: pctd(dev.citywide.yoy),
      citywide_vs_baseline_pct: pctd(dev.citywide.deviation),
      boroughs: dev.boroughs.map((b) => ({ name: b.name, filings: b.latest.filings, yoy_pct: pctd(b.yoy), regime: b.regime })),
    },
    transactions: {
      citywide_sales: tx.citywide.latest.sales,
      citywide_median_price: Math.round(tx.citywide.latest.med),
      citywide_dollar_volume_billions: Math.round(tx.citywide.latest.vol / 1e9),
      citywide_yoy_pct: pctd(tx.citywide.yoy),
      citywide_median_yoy_pct: pctd(tx.citywide.medianYoY),
      boroughs: tx.boroughs.map((b) => ({ name: b.name, sales: b.latest.sales, median_price: Math.round(b.latest.med), yoy_pct: pctd(b.yoy), regime: b.regime })),
    },
    risk: {
      citywide_class_c: risk.citywide.C, citywide_class_b: risk.citywide.B,
      citywide_311_complaints: risk.citywide.complaints311,
      citywide_311_yoy_pct: risk.citywide.complaints311Yoy ? Math.round((risk.citywide.complaints311 - risk.citywide.complaints311Yoy) / risk.citywide.complaints311Yoy * 100) : null,
      citywide_ecb_balance_millions: Math.round(risk.citywide.ecbBalance / 1e6),
      boroughs: risk.boroughs.map((b) => ({ name: b.name, risk_pressure: b.weighted, class_c: b.C, yoy_pct: pctd(b.yoy), trend: b.regime })),
      fastest_rising_zips: risk.topRising.map((z) => ({ zip: z.zip, area: z.neighborhood, borough: z.borough, risk_pressure: z.weighted, class_c: z.C, yoy_pct: pctd(z.yoy) })),
    },
    local_law_97: {
      covered_buildings: ll97.citywide.covered,
      pct_over_2024_limit: Math.round(ll97.citywide.pct24 * 100),
      pct_over_2030_limit: Math.round(ll97.citywide.pct30 * 100),
      est_annual_penalty_millions_2024: Math.round(ll97.citywide.pen24 / 1e6),
      est_annual_penalty_millions_2030: Math.round(ll97.citywide.pen30 / 1e6),
      boroughs: ll97.boroughs.map((b) => ({ name: b.name, est_penalty_millions: Math.round(b.pen24 / 1e6), pct_over_2030: Math.round(b.pct30 * 100) })),
    },
    cross_signal: {
      oversupply_watch: cross.oversupply.map((z) => ({ zip: z.zip, area: z.neighborhood, borough: z.borough, supply_yoy_pct: pctd(z.devYoY), demand_yoy_pct: pctd(z.txYoY), immediately_hazardous_violations: z.hazardC })),
      tightening: cross.tightening.map((z) => ({ zip: z.zip, area: z.neighborhood, borough: z.borough, supply_yoy_pct: pctd(z.devYoY), demand_yoy_pct: pctd(z.txYoY), immediately_hazardous_violations: z.hazardC })),
    },
    capital: capital ? {
      rates: capital.rates.map((r) => ({ name: r.name, latest_pct: r.latest.value, yoy_change_bps: r.yoyBps, role: r.role })),
      cycle_boom_vs_now: capital.lens.cycle ? {
        period: `2021 low-rate boom vs. ${capital.lens.cycle.toLabel}`,
        mortgage_30yr_pct: [capital.lens.cycle.mortgage30.from, capital.lens.cycle.mortgage30.to],
        treasury_10yr_pct: [capital.lens.cycle.treasury10.from, capital.lens.cycle.treasury10.to],
        recorded_sales_per_month: capital.lens.cycle.sales ? [capital.lens.cycle.sales.from, capital.lens.cycle.sales.to] : null,
        recorded_sales_change_pct: capital.lens.cycle.sales ? pctd(capital.lens.cycle.sales.pct) : null,
      } : null,
      mortgage_vs_sales_correlation_yoy: (capital.lens.correlations.find((c) => c.rate === '30-Year Mortgage') || {}).r ?? null,
      note: 'Correlation is association, not causation. Development filings are NOT rate-driven (DOB NOW migration + policy deadlines); demand (sales) is the rate-sensitive channel.',
    } : null,
  };
}

const SYSTEM = `You are the lead market analyst for "Urban Update," an NYC real-estate intelligence product for developers, investors, owners, and operators.

You will receive a DATA payload of real, current figures drawn from official NYC sources (DOB filings, DOF sales, HPD/311/ECB risk signals, Local Law 97 benchmarking) plus national capital-market rates (FRED: Treasury, mortgage, SOFR, Fed Funds). Write a concise daily intelligence brief and a set of neighborhood spotlights.

Use the capital data as macro context — the cost of capital is the master variable behind demand. When it strengthens a point, connect it to the local feeds (e.g., how rising financing costs align with softer recorded sales). Respect the note that development filings are not rate-driven; demand (sales) is the rate-sensitive channel.

Hard rules:
- Use ONLY numbers present in DATA. Never invent, estimate, or round to a different figure. Never name an address, project, or trend not supported by DATA.
- Separate fact from interpretation. State the figure first (fact), then, if useful, a clearly-hedged implication using words like "suggests," "may," or "worth watching" (interpretation).
- Institutional tone: precise, useful, no hype, no filler, no emoji.
- This is market intelligence, not investment advice. Do not tell anyone to buy, sell, or hold.
- The strongest insights connect two or more feeds (e.g., supply vs. demand vs. risk in the same area).
- Keep the whole brief tight: a one-line headline, a 2–3 sentence summary, 3–5 insights, and 3–5 neighborhood spotlights.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string' },
    insights: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { title: { type: 'string' }, detail: { type: 'string' }, feed: { type: 'string' } },
        required: ['title', 'detail', 'feed'],
      },
    },
    neighborhoods: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { area: { type: 'string' }, narrative: { type: 'string' } },
        required: ['area', 'narrative'],
      },
    },
  },
  required: ['headline', 'summary', 'insights', 'neighborhoods'],
};

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.log('ANTHROPIC_API_KEY not set — skipping narration (existing narratives.json kept).');
    return;
  }

  const [dev, tx, risk, ll97, cross] = await Promise.all([
    read('development.json'), read('transactions.json'), read('risk.json'), read('ll97.json'), read('crosssignal.json'),
  ]);
  let capital = null;
  try { capital = await read('capital.json'); } catch { /* optional feed */ }
  const evidence = buildEvidence(dev, tx, risk, ll97, cross, capital);

  console.log(`Generating brief with ${MODEL}…`);
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Produce the daily NYC real-estate brief and neighborhood spotlights from this DATA. Reference the as_of dates so readers know each figure's period.\n\nDATA:\n${JSON.stringify(evidence, null, 2)}`,
      }],
    }),
  });

  if (!res.ok) {
    console.error(`Claude API ${res.status}: ${(await res.text()).slice(0, 400)}`);
    process.exit(1);
  }
  const data = await res.json();
  if (data.stop_reason === 'refusal') {
    console.error('Request refused; leaving existing narratives.json in place.');
    return;
  }
  const text = (data.content || []).find((b) => b.type === 'text');
  if (!text) { console.error('No text block in response.'); process.exit(1); }
  const parsed = JSON.parse(text.text);

  const out = {
    meta: {
      product: 'Urban Update', feed: 'Brief',
      generatedAt: new Date().toISOString(),
      model: data.model || MODEL,
      grounding: 'Synthesized by Claude from the five processed feeds. Every figure traces to primary NYC data; interpretation is the model\'s and clearly hedged.',
      periods: evidence.as_of,
    },
    ...parsed,
  };
  await writeFile(OUT, JSON.stringify(out, null, 2));
  console.log(`Wrote ${OUT} (${out.insights.length} insights, ${out.neighborhoods.length} spotlights)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
