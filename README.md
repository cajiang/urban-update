# Urban Update

**A market-intelligence dashboard for real estate professionals operating in New York.**

Urban Update continuously monitors New York property, policy, capital, development, neighborhood, and operating signals; determines which market regimes are changing; identifies who and what is affected; and explains the practical implications with verifiable evidence.

The premise: *in real estate, information is the first move toward becoming a top-tier player.* Urban Update exists to give its users that informational edge — not raw data, but understanding.

---

## The core loop

Everything the product does resolves to four steps:

1. **Monitor** — continuously ingest signals across the six domains below.
2. **Detect regime change** — determine which market regimes are shifting (not just what changed, but when the underlying pattern breaks).
3. **Identify who & what is affected** — map each shift to the specific actors, asset classes, submarkets, and deals it touches.
4. **Explain the implications** — translate the shift into practical, decision-ready guidance, always backed by verifiable evidence.

The last step is the product. Anyone can surface a data point; Urban Update's job is the *so what*, with a citation.

---

## Signal domains

The six categories of signals the dashboard tracks:

| Domain | What it covers (initial framing) |
|--------|----------------------------------|
| **Property** | Prices, rents, inventory, absorption, cap rates, transaction volume, distress. |
| **Policy** | Zoning, rent regulation, tax (e.g. 421-a/485-x, ICAP), housing legislation, City & State actions. |
| **Capital** | Debt & equity availability, rates, lending standards, CMBS, institutional flows. |
| **Development** | Pipeline, permits, filings, construction starts/completions, major projects. |
| **Neighborhood** | Demographics, migration, employment, retail vitality, safety, amenities, sentiment. |
| **Operating** | Expenses, taxes, insurance, energy/Local Law 97, vacancy, operational risk. |

*These are a starting point — each will be refined as we define its signals and sources.*

---

## Regions covered

- **New York City** (five boroughs)
- **Upstate New York**
- **Long Island**
- **Westchester**

Each region will get its own structure ("stat rooms") once we scope its signals.

---

## Evidence standard

A claim without a source does not ship. Every signal, regime call, and implication must trace to verifiable evidence — a filing, a dataset, a primary document, a named publication. This is the product's credibility and its moat.

---

## Status

**Phase: v1 — first feed built end-to-end.** The **NYC Development feed** is live: it pulls New Building & demolition filings from DOB NOW, aggregates monthly by borough, detects regime shifts with a transparent rule, and renders a self-contained dashboard where every figure links to the underlying records.

- **Run it:** see [RUN.md](RUN.md) — `node src/pipeline.mjs && node src/build-dashboard.mjs`, then open `dashboard/index.html`.
- **How it's built & why:** [DECISIONS.md](DECISIONS.md) (decision log) · [SOURCES.md](SOURCES.md) (pinned sources).

This is now a **portfolio project**: a dashboard mimicking institutional research, built from public data that is easy to obtain and easy for AI to analyze. Each panel carries an AI-generated, cited interpretation.

**Done:** source verified (DOB `official`, daily) · provenance & freshness panel · **neighborhood (NTA) drill-down** (click a borough) · pushed to [github.com/cajiang/urban-update](https://github.com/cajiang/urban-update).

## Next
1. **Second feed:** Investment sales / transactions (ACRIS).
2. **Third feed:** Capital & macro conditions (FRED — Treasury yields, SOFR, mortgage rates).
3. **Later:** LLM interpretation layer (deferred until more feeds are in), watchlists, natural-language "Ask the Market", historical/scenario tools.
