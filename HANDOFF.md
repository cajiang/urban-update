# Urban Update — Handoff

_For the next session. Read this first, then `DECISIONS.md` (the canonical decision log) and `SOURCES.md` (verified data sources)._

## ⏩ Pick up here (2026-08-03 handoff — end of session #2)
- **Last commit `c258878`** (Capital feed + bug fixes + key-security) is pushed. **Uncommitted on disk:** `src/narrate.mjs` (graceful-skip-on-API-error fix), `run.ps1` (new DPAPI launcher — no secret, safe to commit), and refreshed generated files (data/processed/*.json + dashboard/index.html from a live re-pull). Ask the user before committing.
- **Systems check PASSED** — every feed was independently re-queried against its live source: Development, Transactions, Risk (citywide C 59,792 & 311 185,888 exact), LL97 (covered 28,925 fully reconciled), Cross-Signal, Capital — all match or are explained. Data is fresh and correct; analysis logic (regime thresholds, 3×C+B risk weight, ZIP joins, LL97 model) is data-supported.
- **Open finding (offered, not yet done):** LL97 method note says "Covered = buildings ≥25,000 sq ft" but the covered set also requires valid positive reported GHG + a derivable borough (~3,300 excluded, which nudges "% over limit" up). Suggested tightening the note to "≥25k sq ft **with reported emissions data**." Awaiting user's go-ahead.
- **The AI Brief is still the committed seed** — it needs the user's `ANTHROPIC_API_KEY` to regenerate (never in Claude's env; never ask the user to paste it in chat). Run path: `.\run.ps1` (see below). Once it prints "Generating brief with claude-opus-5… / Wrote narratives.json", verify the Brief's figures trace to the (now-verified) feeds and its cross-feed reasoning — especially the capital lens — is sound.

## What this is
An **NYC real-estate market-intelligence dashboard** — a **portfolio project** for founder **cajiang** that mimics what an institutional research team produces, generated automatically by AI from **public data that is easy to obtain and easy for AI to analyze**, with every figure traceable to a primary source. Not a startup chasing paying users; success = a credible, impressive, working artifact. Audience: NYC industry professionals broadly (developers, investors, owners, operators).

**Core loop:** monitor → detect regime change → identify who/what is affected → explain with verifiable evidence. The *explanation with a citation* is the product; the evidence standard (no claim ships without a source) is the moat.

## Current state (feature-complete v1)
Self-contained tabbed dashboard, **7 tabs**, ~585 KB, opens in any browser (data inlined, no server):
1. **Brief** — daily AI synthesis (Claude) across all feeds; headline + key-signal cards + neighborhood spotlights; figures colorized. The landing tab.
2. **Development** (DOB, daily) — New Building & demolition filings, borough + neighborhood (NTA) drill-down.
3. **Transactions** (DOF, monthly) — recorded sales, median price, $ volume, borough + neighborhood drill-down.
4. **Capital** (FRED, keyless) — cost of capital (10Y, 30Y mortgage, SOFR, Fed Funds) as a *lens* on local demand: cycle comparison + dual-axis chart + detrended correlation. Rates vs. recorded sales only (filings excluded as spurious — see D28).
5. **Cross-Signal** — joins Development + Transactions + risk by property ZIP; flags oversupply-watch vs. tightening.
6. **Risk** (HPD/311/ECB, daily) — severity-weighted Risk Pressure, borough + ZIP drill-down, fastest-rising ZIPs.
7. **Local Law 97** (LL84 benchmarking) — per-building carbon-penalty exposure, 2024 & 2030 periods, borough + ZIP.

Every panel has its own provenance/freshness note; every figure links to the underlying records.

## Repo & how to run
- GitHub: **https://github.com/cajiang/urban-update** (public, `main`). `gh` authed as `cajiang`. Git identity: `cajiang` / `calvinj18766@gmail.com`.
- **Zero-dependency Node** (Node 24 + curl present; NO Python, NO npm/`node_modules`, NO `package.json`). Everything runs with `node`.
- **Refresh everything:** `node src/refresh.mjs` (runs all 8 steps: pipeline → transactions → risk → ll97 → capital → crosssignal → narrate → build-dashboard).
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

## Open roadmap (all optional — user's call next)
- **Risk phase-2 extras:** Facades/LL11 (`xubg-57si`), tax liens (`9rz4-mjek`, biannual), flood/climate (`mrjc-v9pm`, census-tract geometry — needs a geo join). Foreclosure/lis pendens is a gap (not on Open Data; ACRIS/State courts).
- **Visual polish:** an NYC map/choropleth (data already carries `nta`, `bbl`, lat/long).
- **Distress/watchlist** — considered & deferred: property-level foreclosure is a narrower audience + no clean public source (ACRIS coverage broken, courts/DFS not bulk-APIs); a submarket distress-pressure signal from existing ECB/HPD/LL97 data remains the on-thesis option if revisited.

_(FRED capital strip: **DONE** — shipped as the Capital tab, D27.)_

## How to work with this user (from feedback)
- They value **honest diligence over speed** — verify sources before building; surface data-quality problems; disclose approximations.
- They push back well and want you to **think**, not just agree; update when their argument is better (happened multiple times).
- **Locally-specific, differentiated, AI-analyzable public data** is the design constraint — avoid generic/commodity data. Deepen integration over adding disconnected breadth.
- Prefer a clear recommendation + a focused question over an exhaustive survey. Keep momentum; commit/push at checkpoints.
