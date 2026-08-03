# Spec — First Slice: Development × NYC

**Product:** Urban Update (see [README](README.md))
**Form factor:** Research / report system (reports first; dashboard later)
**Slice:** Development signals, New York City (five boroughs)
**Primary user:** Developers · **Secondary:** Acquisitions / land investors
**Status:** Scoping

---

## 1. Why this slice

Development in NYC is the best proving ground for Urban Update's core loop because the underlying data is:

- **Public** — NYC Open Data + DOB, no licensing gates for v1.
- **Countable** — permits, filings, units, projects. Regime change can be measured, not guessed.
- **Citable** — every number traces to a specific filing or dataset row, satisfying the evidence standard.

If the *monitor → detect → identify → explain* loop works here, it generalizes to the harder, softer domains.

---

## 2. Signals we track

| # | Signal | Question it answers | Primary source |
|---|--------|---------------------|----------------|
| S1 | **New Building filings** | How much new construction is entering the pipeline? | DOB Job Application Filings / DOB NOW: Build |
| S2 | **Permit issuance** | What's actually cleared to build (vs. just filed)? | DOB Permit Issuance |
| S3 | **Units in pipeline** | How many housing units, by stage & borough? | DCP Housing Database / Housing Production |
| S4 | **Certificates of Occupancy** | What's completing and delivering? | DOB Certificate of Occupancy |
| S5 | **Demolitions** | Where is stock being cleared (redevelopment signal)? | DOB filings (demo jobs) |
| S6 | **Major projects** | Which large projects move the submarket? | Derived: filings above a size threshold |

*Each signal is sliced by borough and, where possible, neighborhood (community district / ZIP).*

---

## 3. The core loop, applied

1. **Monitor** — pull the above signals on a defined cadence (proposed: weekly refresh, since filings/permits update daily but weekly is enough to read a trend without noise).
2. **Detect regime change** — for each signal + geography, compare the current window against a trailing baseline. Flag when the pattern breaks (e.g. new-building filings in a borough deviate materially from trend, a neighborhood's pipeline inflects, a policy-linked filing surge).
3. **Identify who & what is affected** — map each flagged shift to: borough/neighborhood, asset class, project stage, and the actor type it touches (developer competing for sites, investor modeling supply).
4. **Explain** — write the *so what* in plain language, each claim carrying a citation to the filing or dataset row.

---

## 4. Report structure (the deliverable)

Proposed **weekly NYC Development Brief**:

1. **Headline regime calls** — the 1–3 shifts that actually matter this week.
2. **By-the-numbers** — signal table vs. baseline, per borough.
3. **What changed & who's affected** — each regime call expanded: the shift, the affected parties, the implication.
4. **Watchlist** — early/ambiguous signals not yet a call.
5. **Evidence appendix** — every figure linked to source (dataset + query/row or filing number).

---

## 5. Data sources (to verify exact endpoints at build)

All via NYC Open Data (Socrata API, `data.cityofnewyork.us`) unless noted:

- **DOB Job Application Filings** (legacy) & **DOB NOW: Build – Job Application Filings**
- **DOB Permit Issuance**
- **DOB Certificate of Occupancy**
- **DCP Housing Database (HousingDB)** — net housing units by project/stage
- **PLUTO / MapPLUTO** (DCP) — parcel context for geolocating filings
- Cross-reference: **ACRIS** (ownership/transactions) for actor identification

> Exact dataset IDs and field schemas get verified and pinned when we build ingestion — consistent with the evidence standard, we cite the specific dataset version.

---

## 6. Open decisions before build

1. **Baseline window** — what trailing period defines "normal" for regime detection (e.g. trailing 8–13 weeks + same-period-last-year)?
2. **Regime-change threshold** — statistical (z-score / percentile) vs. rule-based to start?
3. **Geography grain** — borough for v1, or push to community district / neighborhood immediately?
4. **Historical backfill** — how far back do we load to establish baselines (e.g. 2–3 years)?
5. **Delivery format** — Markdown brief in-folder for v1, or also a rendered/printable output?

---

## 7. Proposed build sequence

1. **Verify & pin sources** — confirm dataset IDs, fields, and API access; document them.
2. **Ingestion** — pull one signal (S1: New Building filings) end-to-end, with backfill.
3. **Baseline + detection** — implement regime-change logic on S1 for one borough.
4. **Report generation** — produce the first brief from S1, with evidence appendix.
5. **Expand** — add remaining signals and boroughs once the loop is proven on S1.
