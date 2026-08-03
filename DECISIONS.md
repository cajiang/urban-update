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

## Principles (from the product brief, adopted)
- **Evidence before eloquence** — no claim ships without a verifiable primary source.
- **Facts vs. inference stay separate** — label confirmed facts vs. interpretation.
- **Primary sources first** — original filing/dataset over trade press.
- **Transparency over false precision** — explainable scores, no black boxes.
- **Build narrowly before expanding** — one feed, one region, proven, then widen.
