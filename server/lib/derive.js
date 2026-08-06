// Odds-derivation engine (赔率推导引擎) — pure math over decimal odds.
// Mirrors SportteryAPI/src/derive.ts.

/** Parse a decimal-odds value that may arrive as "1.44", " ", null, etc. */
export function toOdds(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || n <= 1) return null;
  return n;
}

/** Derive implied / no-vig probabilities, return rate and fair odds for one market. */
export function deriveMarket(oddsList) {
  const valid = oddsList.filter((o) => Number.isFinite(o) && o > 1);
  const overround = valid.reduce((s, o) => s + 1 / o, 0);
  const returnRate = overround > 0 ? 1 / overround : 0;
  const perOutcome = oddsList.map((o) => {
    const ok = Number.isFinite(o) && o > 1;
    const impliedProb = ok ? 1 / o : 0;
    const noVigProb = ok && overround > 0 ? impliedProb / overround : 0;
    const fairOdds = noVigProb > 0 ? 1 / noVigProb : 0;
    return { odds: o, impliedProb, noVigProb, fairOdds };
  });
  return { overround, returnRate, margin: 1 - returnRate, perOutcome };
}

/** Value/Kelly analysis of one offered outcome against a reference probability. */
export function valueOf(offeredOdds, refProb) {
  const o = offeredOdds;
  const p = Math.min(Math.max(refProb, 0), 1);
  const kelly = o * p;
  const ev = kelly - 1;
  const b = o - 1;
  const q = 1 - p;
  const f = b > 0 ? (b * p - q) / b : 0;
  return {
    odds: o,
    refProb: p,
    kelly,
    ev,
    kellyFraction: Math.max(0, f),
    isValue: kelly > 1,
  };
}

/** Compare an offered odds set against a reference odds set for the same market. */
export function compareOdds(offered, reference) {
  if (offered.length !== reference.length) {
    throw new Error("offered and reference odds lists must be the same length");
  }
  const ref = deriveMarket(reference);
  return offered.map((o, i) => valueOf(o, ref.perOutcome[i]?.noVigProb ?? 0));
}

/** Round to n decimal places without floating-point string noise. */
export function round(x, n = 4) {
  if (!Number.isFinite(x)) return 0;
  const f = 10 ** n;
  return Math.round(x * f) / f;
}
