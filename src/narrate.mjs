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
function buildEvidence(dev, tx, risk, ll97, cross, capital, demand) {
  const pctd = (x) => x == null ? null : Math.round(x * 100);
  const hasDemand = demand && !(demand.meta && demand.meta.skipped);
  return {
    as_of: {
      development: dev.meta.latestMonthLabel,
      transactions: tx.meta.latestMonthLabel,
      risk: risk.meta.windowLabel,
      ll97_report_year: ll97.meta.reportYear,
      cross_signal: cross.meta.windowLabel,
      capital: capital ? capital.rates[0].latest.date : null,
      demand_affordability: hasDemand ? `ACS 5-year ${demand.meta.vintages.current}` : null,
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
    demand_affordability: hasDemand ? {
      mortgage_rate_pct: demand.rate.value,
      citywide: demand.city ? {
        median_household_income: demand.city.income,
        median_sale_price: demand.city.dofMedianPrice,
        income_required_to_buy: demand.city.engine.incomeRequired,
        affordability_gap_x: demand.city.engine.gapRatio,
        share_can_afford_pct: pctd(demand.city.engine.shareCanAfford),
        renter_cost_burden_pct: pctd(demand.city.rentBurdenShare),
        income_growth_pct: pctd(demand.city.growth.income),
        rent_growth_pct: pctd(demand.city.growth.rent),
        home_value_growth_pct: pctd(demand.city.growth.value),
      } : null,
      boroughs: demand.boroughs.map((b) => ({
        name: b.borough, median_income: b.income, income_required_to_buy: b.engine.incomeRequired,
        affordability_gap_x: b.engine.gapRatio, share_can_afford_pct: pctd(b.engine.shareCanAfford),
        renter_cost_burden_pct: pctd(b.rentBurdenShare), divergence: b.divergence.cls,
      })),
      divergence_tally: demand.divergenceTally,
      least_affordable_zips: demand.zips.slice(0, 6).map((z) => ({
        zip: z.zip, area: z.borough, median_income: z.income, income_required_to_buy: z.engine.incomeRequired,
        affordability_gap_x: z.engine.gapRatio, renter_cost_burden_pct: pctd(z.rentBurdenShare), divergence: z.divergence.cls,
      })),
      growth_window: `${demand.meta.vintages.prior}→${demand.meta.vintages.current}`,
      note: 'Affordability = income required to buy the local median-priced home at the current mortgage rate (20% down, 30% DTI, principal & interest only — a floor) vs. ACS median household income; "share can afford" is an estimate. Divergence classes compare home-value/income/rent growth: affordability stress = rents outrunning incomes, yield compression = values outrunning rents, improving fundamentals = incomes outrunning values. The largest ownership gaps fall in low-income, majority-renter areas — pair a high gap with renter cost burden, not with a claim that everyone there is buying.',
    } : null,
  };
}

const SYSTEM = `You are the lead market analyst for "Urban Update," an NYC real-estate intelligence product for developers, investors, owners, and operators.

You will receive a DATA payload of real, current figures drawn from official NYC sources (DOB filings, DOF sales, HPD/311/ECB risk signals, Local Law 97 benchmarking) plus national capital-market rates (FRED: Treasury, mortgage, SOFR, Fed Funds) and a Demand & Affordability read (U.S. Census ACS income, rent, and home value combined with our sale prices and the mortgage rate). Write a concise daily intelligence brief and a set of neighborhood spotlights.

Use the capital data as macro context — the cost of capital is the master variable behind demand. When it strengthens a point, connect it to the local feeds (e.g., how rising financing costs align with softer recorded sales). Respect the note that development filings are not rate-driven; demand (sales) is the rate-sensitive channel.

Use the demand_affordability data to judge whether price and sales moves are supported by incomes or fragile: the income required to buy vs. the local median income, the share who can afford, renter cost burden, and the price-vs-income-vs-rent divergence classes. Sales volume is liquidity, not demand strength — affordability tells you whether purchasing power backs the market. Note affordability is a structural, annual, lagged (ACS 5-year) read; the ownership "gap" is largest in low-income, majority-renter areas where buying is out of reach, so pair a high gap with renter cost burden rather than implying everyone there is a buyer.

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
  let demand = null;
  try { demand = await read('demand.json'); } catch { /* optional feed */ }
  const evidence = buildEvidence(dev, tx, risk, ll97, cross, capital, demand);

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
    const body = (await res.text()).slice(0, 400);
    const hint = res.status === 401 ? ' → key invalid/rejected. Check ANTHROPIC_API_KEY is set in THIS shell (no stray quotes/whitespace); rotate if unsure.'
      : res.status === 400 ? ' → request rejected (bad parameter or schema).'
      : res.status === 429 ? ' → rate limited; retry later.'
      : (res.status >= 500 ? ' → Anthropic service error; retry later.' : '');
    console.error(`Claude API ${res.status}${hint}\n${body}`);
    console.error('Skipping narration — existing narratives.json kept; the rest of the build continues.');
    return;   // don't halt the refresh chain; the dashboard still rebuilds
  }
  const data = await res.json();
  if (data.stop_reason === 'refusal') {
    console.error('Request refused; leaving existing narratives.json in place.');
    return;
  }
  const text = (data.content || []).find((b) => b.type === 'text');
  if (!text) { console.error('No text block in response; keeping existing narratives.json.'); return; }
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
