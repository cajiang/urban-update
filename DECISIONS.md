# Urban Update — Decision Log

> The canonical record of product & architecture decisions. **Every collaborator (human or LLM) reads this first.** Append new decisions; don't rewrite history. Flag any contradiction with an entry here before acting.

| # | Date | Decision | Rationale | Status |
|---|------|----------|-----------|--------|
| D1 | 2026-08-03 | Build Urban Update as a **market-intelligence product** for NY real estate. | Core loop: monitor → detect regime change → identify who's affected → explain with evidence. | Active |
| D2 | 2026-08-03 | **Portfolio project**, not a startup chasing paying users. | Goal is to expand the founder's AI portfolio by showing AI replicate institutional research. Success = a credible, working artifact — not signed pilot users. | Active |
| D3 | 2026-08-03 | **Mimic institutional research** (CBRE / JLL / Cushman / Marcus & Millichap style) using **public data that is easy to obtain and easy for AI to analyze.** | This is the primary design constraint. Favors structured public APIs (NYC Open Data, ACRIS, FRED) over messy/private data (insurance quotes, private loan terms, sentiment). | Active |
| D4 | 2026-08-03 | Artifact is a **dashboard** (each panel carries an AI-written, cited interpretation). | Supersedes the earlier "report-first" call — a dashboard is more portfolio-impressive and demonstrates the AI live. The evidence-first loop is preserved via per-panel citations. | Active — supersedes earlier report-first note in SPEC |
| D5 | 2026-08-03 | Audience = **industry professionals broadly** (owners, developers, investors, brokers). | Institutional "state of the market" research is consumed across roles. Earlier owner-vs-developer debate dissolves under the portfolio goal. | Active — supersedes owner/operator-only framing |
| D6 | 2026-08-03 | **Build one feed end-to-end first: Development × NYC.** Expand to Transactions (ACRIS) + Capital/macro (FRED) after the pattern is proven. | Development data (DOB/DCP) is the most public, countable, and AI-parseable. Prove the loop on the cleanest feed. | Active |
| D7 | 2026-08-03 | Stack = **Node.js (zero-dependency) pipeline + self-contained static HTML dashboard.** | Node 24 + curl already present; no Python. Founder is an AI builder, not a traditional engineer — keep it simple, portable, reviewable. | Active |
| D8 | 2026-08-03 | Primary source for Development feed = **DOB NOW: Build – Job Application Filings** (`w9ak-ipjd`). Legacy `ic3t-wcy2` is historical-only (New Buildings dead-end at 2020). | Verified live: fresh through 2026-08-01, has `filing_date`, `job_type`, `proposed_dwelling_units`, `borough`, `nta`, `bbl`; ~10yr history. See [SOURCES](SOURCES.md). | Active |
| D9 | 2026-08-03 | Regime detection v1 = **transparent rule** (latest complete month vs. trailing-12-month average + YoY), not ML. | Principle: transparent rules before opaque models; every number must be explainable and cited. | Active |
| D10 | 2026-08-03 | **Neighborhood (NTA) drill-down:** click a borough → modal ranks its neighborhoods with New Building filings, each row verifiable. | User wants to click into a borough and see neighborhood-area detail. NTA field is clean (~1% null). | Active |
| D11 | 2026-08-03 | At neighborhood grain, **suppress noisy signals**: only flag Elevated/Cooling when 12-mo avg ≥2 or year-ago ≥3; show the 12-month average (not a %) as context; show YoY% only when year-ago base ≥3. | Small denominators produce absurd %s (e.g. +1400% off a base of 1) that read as hype and kill credibility. | Active |
| D12 | 2026-08-03 | Source verified & **GitHub live**: DOB `official` provenance, daily updates, figures re-checked against source. Repo `github.com/cajiang/urban-update` (public). | User asked to verify reputable sourcing + freshness and to save work to GitHub against usage limits. | Active |
| D13 | 2026-08-03 | **Rejected ACRIS Master** (`bnx9-e6tj`) for the transactions feed — recent borough coverage is broken (Brooklyn ~77 deeds/mo vs thousands in reality; Staten Island absent). Built on **DOF Rolling (`usep-8jbt`) + Annualized (`w2pb-icbu`) Calendar Sales** instead, split at the year boundary. | User mandate: trusted, monitorable, complete sources only. Verified all 5 boroughs present & balanced; both DOF `official`. See [SOURCES](SOURCES.md). | Active |
| D14 | 2026-08-03 | **Dashboard refactored to a tabbed multi-feed layout** (Development · Transactions), each with its own regime call, KPIs, borough grid, notable list, and provenance panel. | Second feed needs its own space; tabs scale as FRED etc. are added. Single self-contained HTML retained. | Active |
| D15 | 2026-08-03 | Transactions **lag handling**: sales accrue for weeks, so the latest complete month = source update-month − 2 (currently May 2026). Reported in-dashboard. | Prevents presenting a partial month as a regime shift. | Active |
| D16 | 2026-08-03 | **FRED rejected as next step; chose to deepen instead.** Added neighborhood drill-down to the Transactions feed (DOF `neighborhood` field), mirroring Development — both feeds now symmetric. | FRED is commodity, non-local, non-differentiated data available everywhere; deepening local depth is higher-impact and leverages our edge. FRED demoted to optional context strip, later. | Active |

## Principles (from the product brief, adopted)
- **Evidence before eloquence** — no claim ships without a verifiable primary source.
- **Facts vs. inference stay separate** — label confirmed facts vs. interpretation.
- **Primary sources first** — original filing/dataset over trade press.
- **Transparency over false precision** — explainable scores, no black boxes.
- **Build narrowly before expanding** — one feed, one region, proven, then widen.
