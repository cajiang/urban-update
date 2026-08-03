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

## Planned next sources (not yet built)
- **ACRIS** (deeds/transactions) — investment-sales feed.
- **FRED** (Treasury yields, SOFR, mortgage rates) — capital-conditions feed.
- **DCP Housing Database** — net-units pipeline cross-check.
