# Urban Update — Handoff

_For the next session. Read this first, then `DECISIONS.md` (the canonical decision log) and `SOURCES.md` (verified data sources). When it's time to hand off again, follow `HANDOFF_PROCESS.md` — including its mandatory pressure test._

## ⏩ Pick up here (2026-08-05 — end of session #4)
- **8-tab dashboard complete.** Session #4 SHIPPED the **Demand & Affordability feed (8th tab)** — the Census-key activation lag cleared, and the feed was built and verified end-to-end. **Working tree has uncommitted changes pending the commit for this feed** (new: `src/lib/census.mjs`, `src/demand.mjs`, `data/processed/demand.json`; modified: `build-dashboard.mjs`, `crosssignal.mjs`, `narrate.mjs`, `refresh.mjs`, `DECISIONS.md`, `SOURCES.md`, `dashboard/index.html`, refreshed `data/processed/*.json`). See D30/D31/D33 + SOURCES v5.
- **What the feed does:** Census ACS5 **2024 (current) + 2020 (prior)** by ZCTA/county/place, combined with our DOF median sale price + FRED 30Y mortgage → (1) affordability engine (income required to buy vs. local income; est. share who can afford), (2) divergence monitor (value/income/rent growth → affordability-stress / yield-compression / improving-fundamentals / supported), (3) renter cost burden. Folded into Cross-Signal (supply+demand+risk+affordability quad) and the narrate packet; added to `refresh.mjs` (now 9 steps). `CENSUS_API_KEY` is env-only (D31), never logged or placed in any output URL; `demand.mjs` skips gracefully **without clobbering** a good `demand.json` (like `narrate.mjs`).
- **Verification done (session #4):** independent fresh ACS re-fetch + from-scratch recompute → **168/168 checks matched** (raw figures + every derived metric + divergence class), across sampled ZIPs, all boroughs, citywide. Source-integrity sweep: all sources still `official`, schemas stable, no source newer than our pull, **ACS5 2025 not yet released** (2024 correct). Added a site-wide **"Built with AI" footer disclaimer** and a **limited-equity co-op disclosure** (Co-op City / ZIP 10475 ACS "value" is a regulated share price, not market — its affordability read isn't comparable).
- **Suggested next builds (from D32 roadmap):** Development upgrade (DCP Housing DB + PLUTO: filed→permitted→completed, net units vs. stock), LL97 neighborhood-concentration reframe, or property-tax/assessment pressure. Fast-follow v1.1 to affordability = BLS employment.
- **Two smaller open items (from session #2, still open):**
  - LL97 method note tweak — user chose to LEAVE it for now (note says "Covered = buildings ≥25k sq ft"; the set also requires positive reported GHG + derivable borough). Not a bug; documented.
  - The AI **Brief is still the committed seed** — regenerating needs the user's `ANTHROPIC_API_KEY` via `.\run.ps1`; then verify its figures trace to the feeds. (Key is never in Claude's env and never pasted in chat.)
- **Systems check (session #3) PASSED** — every feed was independently re-queried vs. live source: Development 1,536 ✓ / Manhattan 109-69 +58% ✓, Transactions SI 249 & citywide 3,921 ✓, Risk citywide C 59,792 & 311 185,888 exact, LL97 covered 28,925 fully reconciled, Cross-Signal ZIP join exact, Capital matched. Data fresh and correct; analysis logic sound.

## What this is
An **NYC real-estate market-intelligence dashboard** — a **portfolio project** for founder **cajiang** that mimics what an institutional research team produces, generated automatically by AI from **public data that is easy to obtain and easy for AI to analyze**, with every figure traceable to a primary source. Not a startup chasing paying users; success = a credible, impressive, working artifact. Audience: NYC industry professionals broadly (developers, investors, owners, operators).

**Core loop:** monitor → detect regime change → identify who/what is affected → explain with verifiable evidence. The *explanation with a citation* is the product; the evidence standard (no claim ships without a source) is the moat.

## Current state (feature-complete v1)
Self-contained tabbed dashboard, **8 tabs**, ~750 KB, opens in any browser (data inlined, no server):
1. **Brief** — daily AI synthesis (Claude) across all feeds; headline + key-signal cards + neighborhood spotlights; figures colorized. The landing tab.
2. **Development** (DOB, daily) — New Building & demolition filings, borough + neighborhood (NTA) drill-down.
3. **Transactions** (DOF, monthly) — recorded sales, median price, $ volume, borough + neighborhood drill-down.
4. **Capital** (FRED, keyless) — cost of capital (10Y, 30Y mortgage, SOFR, Fed Funds) as a *lens* on local demand: cycle comparison + dual-axis chart + detrended correlation. Rates vs. recorded sales only (filings excluded as spurious — see D28).
5. **Cross-Signal** — joins Development + Transactions + risk by property ZIP; flags oversupply-watch vs. tightening.
6. **Risk** (HPD/311/ECB, daily) — severity-weighted Risk Pressure, borough + ZIP drill-down, fastest-rising ZIPs.
7. **Local Law 97** (LL84 benchmarking) — per-building carbon-penalty exposure, 2024 & 2030 periods, borough + ZIP.
8. **Affordability** (Census ACS + our DOF price + FRED mortgage) — income required to buy vs. local income, share who can afford, renter cost burden, and a price-vs-income divergence monitor; borough + ZIP drill-down.

Every panel has its own provenance/freshness note; every figure links to the underlying records. A site-wide footer discloses the dashboard is AI-generated and can be wrong.

## Repo & how to run
- GitHub: **https://github.com/cajiang/urban-update** (public, `main`). `gh` authed as `cajiang`. Git identity: `cajiang` / `calvinj18766@gmail.com`.
- **Zero-dependency Node** (Node 24 + curl present; NO Python, NO npm/`node_modules`, NO `package.json`). Everything runs with `node`.
- **Refresh everything:** `node src/refresh.mjs` (runs all 9 steps: pipeline → transactions → risk → ll97 → capital → demand → crosssignal → narrate → build-dashboard). The `demand` step needs `CENSUS_API_KEY` in the environment; without it that step skips and keeps the existing `demand.json`.
- **Easiest launch (with the AI Brief), for the user on Windows:** `.\run.ps1` — decrypts the DPAPI-encrypted key into that process only, refreshes, opens the dashboard. One-time key setup + the `-ExecutionPolicy Bypass` fallback are documented in the `run.ps1` header and `RUN.md`. Claude cannot regenerate the Brief itself (no key in its env).
- **The Brief needs a key:** set `ANTHROPIC_API_KEY` before refresh to regenerate it live (`claude-opus-5`, raw `fetch` to the Messages API). Without a key, narration skips and the committed **seed** brief is kept; everything else still builds. **Key security (D29):** env-only, never committed, never in chat/memory, never received by Claude — the user runs the keyed step themselves (ephemeral env var / secret store). `.env`/secrets are gitignored. See [SOURCES.md](SOURCES.md) + `RUN.md`.
- **Capital feed is keyless** (FRED public CSV) — no key needed for anything except the Brief.
- Open `dashboard/index.html` after building. **Commit + push at each checkpoint** (user is usage-limit aware).

## Architecture (all in `src/`)
- `lib/socrata.mjs` — source registry (dataset IDs) + `soqlQuery` + `fetchDatasetMeta`. Single source of truth for sources.
- `pipeline.mjs` → `data/processed/development.json`
- `transactions.mjs` → `transactions.json`
- `risk.mjs` → `risk.json`
- `ll97.mjs` → `ll97.json`
- `capital.mjs` → `capital.json` (FRED rates via keyless CSV + demand lens; the only non-Socrata feed)
- `crosssignal.mjs` → `crosssignal.json` (also overlays HPD Class C by ZIP)
- `narrate.mjs` → `narratives.json` (LLM Brief; needs key)
- `build-dashboard.mjs` — reads all processed JSON, writes self-contained `dashboard/index.html`
- `refresh.mjs` — runs the whole chain

## Verified sources (all NYC Open Data / Socrata unless noted) — see SOURCES.md
- Development: **DOB NOW: Build** `w9ak-ipjd` (daily; `filing_date`, `job_type`, `proposed_dwelling_units`, `borough`, `nta`, `postcode`, `bbl`).
- Transactions: **DOF Rolling** `usep-8jbt` (≥2026-01) + **Annualized** `w2pb-icbu` (≤2025-12) sales; split at year boundary.
- Risk: **HPD violations** `wvxf-dwi5` (severity class B/C, `zip`), **311** `erm2-nwe9` (`incident_zip`, agency HPD/DOB), **DOB ECB** `6bgk-3dad` (`penality_imposed`/`balance_due`, `issue_date` is YYYYMMDD).
- LL97: **LL84 benchmarking** `5zyy-y8am` (annual; `total_location_based_ghg`, `property_gfa_calculated`, `primary_property_type`, `bbl`, `postal_code`).
- Capital: **FRED** (Federal Reserve, St. Louis) — `DGS10`, `MORTGAGE30US`, `SOFR`, `FEDFUNDS` via the **keyless CSV** endpoint (no API key). The only non-Socrata source.

## Gotchas / lessons baked in (don't relearn these)
- **Rejected ACRIS Master** (`bnx9-e6tj`) for transactions — recent borough coverage is broken (Brooklyn ~77 deeds/mo vs thousands; Staten Island absent). Used DOF sales datasets instead.
- **DOB property ZIP is `postcode`, not `zip`** (`zip` is the applicant's address → surfaced Nassau County ZIPs).
- **LL97 outliers:** derive borough from BBL first digit (text `borough` field often null); drop `intensity > 0.05 tCO2e/sqft` rows (bad data gave $500M single-building penalties). LL97 is a disclosed **screening estimate** (primary-property-type approximation).
- **Small-base noise everywhere:** always gate YoY/regime flags on a minimum base (a % off a base of 1 reads as hype). Each feed has explicit thresholds.
- **Socrata:** cast text-numeric fields (`::number`); exclude null date fields; the current calendar month is partial (use the latest *complete* month; transactions lag ~2 months).
- Scratchpad helper `peek.mjs` (reads stdin JSON, uses `argv[2]`) is handy for probing Socrata during exploration.

## Next build spec — Demand & Affordability feed (ACTIVE, D30)
The agreed next feed. Turns "prices rose X%" into "…but incomes rose only Y% and Z% of households can't afford the median — is this growth real or fragile?" — the #1 gap per a top-tier operator's review.
- **Sources:** Census **ACS 5-year** (`api.census.gov/data/{year}/acs/acs5`, needs `CENSUS_API_KEY`) for income/rent/burden/tenure/population, by **ZCTA (ZIP)** so it joins to our existing ZIP-keyed feeds (Transactions `zip_code`, Development `postcode`, Risk `zip`, Cross-Signal); roll up to borough. Reuse our DOF median price + FRED mortgage rate (already in the pipeline) for the affordability math.
- **ACS variables:** `B19013_001E` (median HH income), `B25064_001E` (median gross rent), `B25077_001E` (median home value), `B01003_001E` (population), `B25003_002E/_003E` (owner/renter), `B25070_001E` + `_007E.._010E` (rent-burdened = share of renters ≥30% of income), `B19001` (income distribution → share who can afford). Pull two vintages for growth (income/rent/pop change).
- **Metrics:** (1) affordability engine — local median price × mortgage rate → payment → income required at 30% DTI → gap vs. ACS median income + est. share who can afford; (2) divergence monitor (D30/interview #6) — price vs income vs rent growth → classify supported-growth / yield-compression / affordability-stress / improving-fundamentals; (3) fold affordability into Cross-Signal per ZIP (supply+demand+risk+affordability quad).
- **Architecture:** `src/lib/census.mjs` (Census fetch + var registry, env key, skip-gracefully if unset) → `src/demand.mjs` → `data/processed/demand.json` → new **Affordability** tab in `build-dashboard.mjs` (borough cards + ZIP drill-down + divergence monitor) → fold into `crosssignal.mjs` + `narrate.mjs` packet → add to `refresh.mjs`.
- **Fast-follow (v1.1):** BLS employment (borough/sector jobs) for the rest of "demand formation" — BLS API, free (keyless tier or free key).

## Feature roadmap from the top-tier interview (D32 — build vs. defer vs. skip)
An operator gave a 12-category wish list — distilled in [INTERVIEW_FEEDBACK.md](INTERVIEW_FEEDBACK.md) (load-bearing points + named sources). Our discipline: build only what's sourceable with verifiable free data AND deepens an existing feed; do NOT try to match all 12 (that sprawls and breaks the evidence standard).
- **BUILD (feasible, high-value):** Demand & Affordability (Census — above, in progress); **upgrade Development** with the DCP Housing Database (`filed→permitted→completed`, net units vs. stock) + PLUTO (fixes "every filing = supply"); **LL97 reframe** to neighborhood concentration of covered buildings (cheap, we have the data); **property-tax/assessment** pressure (DOF assessment roll, on Open Data).
- **DEFER (heavier / medium value):** construction feasibility (materials PPI + land sales + DOB approval times — partial), infrastructure/public-investment (NYC Capital Projects DB, messy geo-join), facility externalities + matched-control impact study (DCP Facilities DB; analytically heavy), quality-of-life trajectory (crime + 311 + school enrollment, normalized — extends Risk).
- **SKIP (no clean free primary source, or curatorial — would break the evidence standard):** cap-rate direction, office occupancy, construction/insurance cost, retail vacancy/concessions, broad regulatory-headline tracking, major-employer/capital-flow tracking. Better to omit than show a number we can't stand behind.

## Older roadmap (still optional)
- **Risk phase-2 extras:** Facades/LL11 (`xubg-57si`), tax liens (`9rz4-mjek`, biannual), flood/climate (`mrjc-v9pm`, census-tract geometry). Foreclosure/lis pendens is a gap (not on Open Data).
- **Visual polish:** an NYC map/choropleth (data already carries `nta`, `bbl`, lat/long).

_(FRED capital strip: **DONE** — Capital tab, D27.)_

## How to work with this user (from feedback)
- They value **honest diligence over speed** — verify sources before building; surface data-quality problems; disclose approximations.
- They push back well and want you to **think**, not just agree; update when their argument is better (happened multiple times).
- **Locally-specific, differentiated, AI-analyzable public data** is the design constraint — avoid generic/commodity data. Deepen integration over adding disconnected breadth.
- Prefer a clear recommendation + a focused question over an exhaustive survey. Keep momentum; commit/push at checkpoints.
