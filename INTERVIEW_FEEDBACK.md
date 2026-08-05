# Interview Feedback — top-tier NYC real-estate operator (2026-08)

Distilled to load-bearing points only. The **build / defer / skip triage** is in
[DECISIONS.md](DECISIONS.md) **D32** — this file is the source detail behind it, for
when we tackle the deferred items. Sourcing reality is in [SOURCES.md](SOURCES.md).

## Through-lines (apply to every feed)
- **Interpret relationships — don't just reproduce charts/series.**
- **Normalize** by population / housing units / establishments; measure **direction vs. the area's own history and comparable areas**, not raw totals.
- **Distinguish lifecycle stage** (announced / funded / approved / under-construction / completed; and filed / permitted / completed).
- Outputs are **"conditions to investigate, not conclusions."** Never assert causation without a **matched-control** comparison.

## The twelve categories

1. **Capital & credit regime** — *Are higher financing costs temporarily freezing transactions, or fundamentally lowering values?* Lending standards / credit availability (FRED SLOOS), est. multifamily borrowing cost, transaction volume vs. financing, cap-rate pressure direction, refinancing/distress trend. *(cap rates + true distress = no clean free source.)*
2. **Affordability & purchasing power** *(ACTIVE BUILD)* — *Is value growth supported by income, or fragile?* Prices vs. income growth, rent growth, cost burden, mortgage payment on a representative home, income required to buy, share of households who can afford. Source: Census/ACS, NYC Population FactFinder.
3. **Demand formation (≠ sales volume)** — *Is the area gaining households able to pay more?* Population / net migration, household formation & size, age/income mix, renter-vs-owner, employment growth, business formation, university/hospital expansion, commuting, capital flows. Sales volume = liquidity, not demand.
4. **Supply & absorption** *(upgrade our Development feed)* — *Is delivery faster or slower than household demand?* Net units after demolition, permits/starts/completions, under construction, delivery schedule, **new units as % of existing stock**, households per new unit, absorption, vacancy direction, concessions. Distinguish **filed vs. permitted vs. completed** (NYC Housing Database).
5. **Construction feasibility / replacement cost** — *Can developers economically add supply?* Construction/labor/material/land/financing/insurance cost, approval timelines, **rent needed to justify new construction vs. actual market rent.**
6. **Divergence monitor** — the matrix: prices+rents+incomes rising = supported growth; prices > rents = yield compression / speculation; rents > incomes = affordability & political risk; income up, prices flat = improving fundamentals; supply > households = future vacancy/concessions; volume down but prices high = seller resistance / weak price discovery.
7. **Regulatory economics (not legal headlines)** — *Which rules change the economics of owning/building/financing?* Rent regulation, LL97, energy/building codes, zoning, conversion rules, affordability requirements, tenant protections, tax-incentive expirations. Per change: stage, coverage, effective date, effect on revenue/expense/capital/supply, who wins/loses, confidence. **LL97 specifically: neighborhood concentration of covered buildings with future capital needs — NOT a daily penalty list.**
8. **Property tax & municipal fiscal pressure** — *Will government raise ownership cost, cut services, or invest?* Assessment growth by geography & class, effective tax burden, expiring exemptions, city/municipal budget pressure, fiscal stress (incl. suburban/upstate).
9. **Employment anchors** — *Diversified durable jobs, or one institution?* Employment growth by sector, major-employer moves, hospital/university investment, office occupancy/conversion, retail open/close, small-business formation, concentration risk.
10. **Infrastructure & public investment** — transit/stations, parks, flood protection, schools, dispositions. **Separate announced / funded / approved / under-construction / completed** (a funded project under construction moves value; an announcement may never happen).
11. **Facility externalities** — shelters, jails, waste, dispensaries, schools, hospitals, venues. **Never assume "new facility = lower value."** Track type/capacity, temporary/permanent, location, opening stage, nearby concentration; after opening, measure prices/rents vs. a **matched control area.** Default: *"insufficient evidence to conclude an effect."*
12. **Quality of life / trajectory** — *Improving vs. its own history & peers?* Serious crime by type, noise/sanitation complaints, retail vacancy, pedestrian activity, school enrollment, building complaints, business open/close — **normalized**, distinguishing reporting behavior from actual conditions.

**Sources the operator named:** FRED · NYC Population FactFinder · NYC Housing Database (project-level) · NYC LL97 page.
