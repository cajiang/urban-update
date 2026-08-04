# Urban Update — Source Registry (verified)

> Pinned, verified data sources. Each entry is the evidence backbone: every dashboard number must trace to one of these. Verified live on **2026-08-03**.

## Development feed (v1)

### DOB NOW: Build — Job Application Filings
- **Dataset ID:** `w9ak-ipjd`
- **Host:** NYC Open Data (Socrata) — `data.cityofnewyork.us`
- **API:** `https://data.cityofnewyork.us/resource/w9ak-ipjd.json`
- **Landing page:** https://data.cityofnewyork.us/Housing-Development/DOB-NOW-Build-Job-Application-Filings/w9ak-ipjd
- **Rows:** ~937,800 · **Coverage:** `filing_date` 2016-08 → present · **Freshness:** through 2026-08-01 (verified)
- **Why this over legacy `ic3t-wcy2`:** the legacy Job Application Filings dataset dead-ends for New Buildings at 2020-12-31; DOB NOW is the current system and stays fresh.

**Key fields used**
| Field | Meaning | Notes |
|-------|---------|-------|
| `job_type` | Filing type | Values: `New Building`, `Alteration`, `Full Demolition`, `Alteration CO`, `No Work`, `ALT-CO - New Building…` |
| `filing_date` | Date the job was filed | The trend axis. ~99% non-null on NB. Sort/aggregate on this. |
| `proposed_dwelling_units` | Units the project proposes | **Stored as text — cast with `::number`** to sum. |
| `borough` | Borough | Full names: Manhattan, Brooklyn, Queens, Bronx, Staten Island. |
| `nta` | Neighborhood (Nbhd Tabulation Area) | For future neighborhood-grain slicing. |
| `bbl`, `house_no`, `street_name` | Property identity | Address + Borough-Block-Lot for evidence links. |
| `proposed_no_of_stories`, `initial_cost` | Project scale | For the "notable filings" evidence table. |
| `current_status_date`, `filing_status` | Status | Latest status; `filing_date` is null on ~1% of rows so don't rely on it alone for recency checks. |

**Canonical query pattern — monthly aggregation by borough**
```
GET /resource/w9ak-ipjd.json
  ?$select = borough,
             date_trunc_ym(filing_date) as month,
             count(*) as filings,
             sum(proposed_dwelling_units::number) as units
  &$where  = job_type='New Building' AND filing_date IS NOT NULL
  &$group  = borough, month
  &$order  = month
```
Same pattern with `job_type='Full Demolition'` gives the demolition (redevelopment) signal.

**Gotchas discovered**
- `sum(proposed_dwelling_units)` fails with a type-mismatch — the column is text; must cast `::number`.
- The current calendar month is always partial — treat the most recent **complete** month as "latest" for regime calls.
- Some records have a null `filing_date`; exclude them (`filing_date IS NOT NULL`) so aggregates aren't skewed.

## Verification log

**2026-08-03 — verified via official Socrata metadata + independent re-query.**
- **Publisher:** Department of Buildings (DOB) · **Provenance flag:** `official` (Socrata's authoritative-government marker). This dataset *is* the primary system of record for NYC construction filings — there is no more-authoritative source to cross-check against; it is the authority.
- **Update frequency:** **Daily** · dataset last refreshed **2026-08-02**.
- **Integrity re-check** (dashboard figures independently re-queried against the live source):
  - Manhattan New Building filings, Jul 2026 → **109** ✓ match · Jul 2025 → **69** ✓ match
  - Citywide New Building filings, Jul 2026 → **1,536** ✓ match
- The pipeline now captures publisher / provenance / update-frequency / last-refresh on every run and displays them in the dashboard's **Data Provenance & Freshness** panel, with a staleness indicator vs. the source's last refresh.

## Transactions feed (v2)

> **Source diligence note (2026-08-03):** We first evaluated **ACRIS – Real Property Master** (`bnx9-e6tj`, DOF, official) but **rejected it for recent sales analytics.** Its recent borough coverage is broken — 2026 DEEDs were ~22k in Manhattan but only ~77/month in Brooklyn (reality is thousands), and Staten Island was absent entirely. Raw ACRIS deeds also mix in $0/non-arm's-length transfers. We pivoted to DOF's purpose-built sales datasets below, which are complete across all five boroughs. This is the "trusted, monitorable source" standard in action.

### DOF — Rolling + Annualized Calendar Sales (used together)
| Dataset | ID | Coverage | Update | Role |
|---------|----|----------|--------|------|
| NYC Citywide **Rolling** Calendar Sales | `usep-8jbt` | trailing 12 mo (→ 2026-06) | Monthly | fresh edge (months ≥ 2026-01) |
| NYC Citywide **Annualized** Calendar Sales | `w2pb-icbu` | 2016 → 2025 | ~Yearly | history for baseline/YoY (months ≤ 2025-12) |

- **Publisher:** Department of Finance · **Provenance:** `official` (both).
- **Split at the year boundary** (Annualized ≤ 2025-12, Rolling ≥ 2026-01) → continuous monthly series, no overlap double-count.
- **Key fields:** `borough` (coded 1=Manhattan, 2=Bronx, 3=Brooklyn, 4=Queens, 5=Staten Island), `sale_price` (text → cast `::number`), `sale_date`, `neighborhood`, `building_class_category`, `address`. Annualized adds `nta`, `bbl`, lat/long (for future neighborhood grain).
- **Sale filter:** `sale_price::number > 10000` to drop $0/nominal transfers (standard for market-sales analysis).
- **Lag handling:** sales accrue for weeks after they occur; the latest 1–2 months are partial. Latest **complete** month = dataset update-month − 2 (documented in-dashboard).

## Risk feed (v3) — all daily/official, ZIP-joinable

> **Diligence (2026-08-03):** compared cadence/reliability across risk sources. The building-risk core updates **daily/every weekday** — the fastest signals we track, and the basis of the "know-first" edge. Slower/gap sources (tax liens biannual; foreclosure not on Open Data; flood = census-tract geometry, structural) deferred to later phases.

| Source | ID | Publisher | Cadence | Role |
|--------|----|-----------|---------|------|
| HPD Housing Maintenance Code Violations | `wvxf-dwi5` | HPD | **Daily** | Habitability risk; severity `class` A/B/C (C = immediately hazardous); has `zip` |
| 311 Service Requests (2020–present) | `erm2-nwe9` | 311 | **~Daily** | Early-warning complaints (`agency in HPD/DOB`); has `incident_zip` |
| DOB ECB Violations | `6bgk-3dad` | DOB | **Weekday** | Financial enforcement: `penality_imposed`, `balance_due`; `issue_date` is `YYYYMMDD` |

- **Risk Pressure** = `3×(Class C) + 1×(Class B)` HPD violations, trailing quarter, YoY (weights explicit).
- Noise gate: a ZIP/borough needs ≥60 weighted pts now and ≥40 a year ago to be Rising/Falling.
- **Cross-Signal risk overlay:** HPD Class C counts by ZIP are also joined into the Cross-Signal view (supply + demand + risk together).

**Deferred risk sources (phase 2+):** Facades/LL11 (`xubg-57si`), Local Law 97 emissions, Tax Lien Sale (`9rz4-mjek`, biannual), Flood Vulnerability Index (`mrjc-v9pm`, census-tract geometry), foreclosure/lis pendens (ACRIS/State courts — not on Open Data). FDNY current violations also a gap (only historical on Open Data).

## Capital feed (v4) — cost of capital (national, FRED)

> The one non-NYC feed, added as a **lens** on the local data (see DECISIONS.md D27–D28). Interest rates are the master variable behind demand; we present them as context on our feeds, not as a standalone ticker.

| Series | FRED ID | Cadence | Role |
|--------|---------|---------|------|
| 10-Year Treasury Constant Maturity | `DGS10` | Daily | Benchmark for CRE cap rates & permanent debt |
| 30-Year Fixed Mortgage Average | `MORTGAGE30US` | Weekly (Freddie Mac) | Residential / 1–4 family borrowing cost |
| Secured Overnight Financing Rate | `SOFR` | Daily | Floating-rate benchmark — construction & bridge debt |
| Federal Funds Effective Rate | `FEDFUNDS` | Monthly | Federal Reserve policy anchor |

- **Publisher:** Federal Reserve Bank of St. Louis (FRED). **Access:** public **keyless CSV** endpoint `https://fred.stlouisfed.org/graph/fredgraph.csv?id=<ID>&cosd=2016-01-01` — **no API key**, preserving the zero-dependency design. Verified live 2026-08-03 (fresh through 2026-07).
- **Aggregation:** monthly averages of each series since 2016. **Gotcha (fixed):** FRED marks missing values (market holidays) with an **empty string**, and `Number('') === 0` — so empties must be guarded, or they enter as phantom zeros and drag the averages down.
- **The lens (demand only):** correlate the **year-over-year change** in each rate with the YoY change in citywide recorded sales (detrended). 30Y-mortgage↔sales r ≈ −0.21. **Development filings are deliberately excluded** — DOB NOW filings only became complete ~2021 and are driven by policy deadlines (421-a), so a rate correlation on them is spurious. Sales are the rate-sensitive channel.
- **Lag handling:** all sales-based analysis is capped at the latest **complete** DOF month (source update − 2), matching the Transactions feed, so partial months don't bias the comparison.
- **Disclosure:** correlation is association, not causation, and is labeled as such in-dashboard.

## Planned next sources (not yet built)
- **DCP Housing Database** — net-units pipeline cross-check.
