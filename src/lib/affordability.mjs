// Urban Update — affordability math (pure, no I/O).
//
// The home-purchase affordability engine, factored out of demand.mjs so it can be
// unit-tested directly. Assumptions are disclosed in the dashboard: 20% down /
// 80% LTV, 30-year fixed at the current mortgage rate, 30% housing DTI, and
// principal & interest ONLY (excludes taxes, insurance, and maintenance) — so
// "income required" is a floor, not the true all-in figure.

export const DOWN_PAYMENT = 0.20; // 20% down → 80% LTV
export const DTI = 0.30;          // 30% of gross income to housing (P&I)
export const TERM_MONTHS = 360;   // 30-year fixed
export const PARETO_ALPHA = 2.0;  // top open-income-bracket ($200k+) tail exponent

// Monthly principal & interest on `loan` at `annualRatePct` over `n` months.
export function monthlyPI(loan, annualRatePct, n = TERM_MONTHS) {
  const m = annualRatePct / 100 / 12;
  if (m === 0) return loan / n;
  const f = Math.pow(1 + m, n);
  return (loan * m * f) / (f - 1);
}

// Annual gross income required to buy `price` at `ratePct`, under the disclosed
// down-payment / DTI / term assumptions. P&I only (excludes taxes, insurance,
// HOA/maintenance) — so this is a floor; true required income is higher.
// Returns null for a non-positive/absent price.
export function incomeRequired(price, ratePct) {
  if (!price || price <= 0) return null;
  const loan = price * (1 - DOWN_PAYMENT);
  return (monthlyPI(loan, ratePct) * 12) / DTI;
}

// Estimated share of households with income ≥ threshold, from the B19001
// distribution: uniform within finite brackets; Pareto tail (α) for the open
// $200k+ bracket. Returns a fraction 0..1, or null if it can't be computed.
export function shareAtOrAbove(threshold, brackets, total) {
  if (!total || threshold == null) return null;
  let above = 0;
  for (const b of brackets) {
    if (b.count == null) continue;
    if (threshold <= b.lo) { above += b.count; continue; }
    if (!Number.isFinite(b.hi)) {                     // open-topped $200k+
      above += b.count * Math.pow(b.lo / threshold, PARETO_ALPHA);
      continue;
    }
    if (threshold >= b.hi) continue;                  // none in this finite bracket
    above += b.count * (b.hi - threshold) / (b.hi - b.lo);   // partial (uniform)
  }
  return above / total;
}
