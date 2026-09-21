// RX CALIBRATION — mandatory probability calibration for the ensemble.
// A model saying 80% must win ~80% of comparable predictions over a large
// sample. Reliability is measured per probability bucket (Brier score, log
// loss, calibration error) from settled, pre-kickoff-recorded predictions
// only — no data leakage. With an insufficient sample the engine applies NO
// bucket correction (it does not invent one from noise), and overconfidence
// discovered in a sufficient sample automatically reduces confidence.

import { clamp } from "./models";

export const BUCKETS = [
  [0.5, 0.6],
  [0.6, 0.7],
  [0.7, 0.8],
  [0.8, 0.9],
  [0.9, 0.95],
  [0.95, 1.0001],
];

export const bucketOf = (p) =>
  BUCKETS.find(([lo, hi]) => p >= lo && p < hi) || BUCKETS[BUCKETS.length - 1];

const MIN_BUCKET_SAMPLE = 20; // below this the bucket's correction is not applied
const MIN_LEARN_SAMPLE = 40; // below this no calibration is claimed at all

// rows: [{ p (calibrated probability), y (1 won / 0 lost) }]
export function metrics(rows) {
  const graded = (rows || []).filter((r) => Number.isFinite(r.p) && (r.y === 0 || r.y === 1));
  const n = graded.length;
  if (!n) return { n: 0, brier: null, logLoss: null, calibrationError: null, buckets: [] };
  let brier = 0, ll = 0;
  const byBucket = {};
  graded.forEach((r) => {
    brier += (r.p - r.y) ** 2;
    ll += -(r.y ? Math.log(Math.max(r.p, 1e-6)) : Math.log(Math.max(1 - r.p, 1e-6)));
    const k = bucketOf(r.p).join("-");
    (byBucket[k] ||= { n: 0, predSum: 0, won: 0, lo: bucketOf(r.p)[0], hi: bucketOf(r.p)[1] });
    byBucket[k].n++;
    byBucket[k].predSum += r.p;
    if (r.y) byBucket[k].won++;
  });
  const buckets = Object.values(byBucket).map((b) => ({
    lo: b.lo,
    hi: b.hi,
    n: b.n,
    predAvg: b.predSum / b.n,
    actualRate: b.won / b.n,
    error: Math.abs(b.predSum / b.n - b.won / b.n),
  }));
  const calibrationError =
    buckets.reduce((s, b) => s + b.error * b.n, 0) / n;
  return {
    n,
    brier: Math.round((brier / n) * 10000) / 10000,
    logLoss: Math.round((ll / n) * 10000) / 10000,
    calibrationError: Math.round(calibrationError * 1000) / 1000,
    buckets,
  };
}

// Build the calibration state the engine applies. Returns null when the
// settled sample is too small to claim anything — honesty over noise.
export function calibrators(rows) {
  const m = metrics(rows);
  if (m.n < MIN_LEARN_SAMPLE) return { ready: false, sample: m.n, metrics: m };
  return {
    ready: true,
    sample: m.n,
    metrics: m,
    factorFor: (p) => {
      const b = m.buckets.find((x) => p >= x.lo && p < x.hi);
      if (!b || b.n < MIN_BUCKET_SAMPLE || !b.predAvg) return 1;
      return clamp(b.actualRate / b.predAvg, 0.75, 1.2);
    },
  };
}

// Apply calibration to an ensemble probability. No sufficient-sample
// correction available → the probability stands as-is (never inflated).
export function calibrate(p, cal) {
  if (!cal || !cal.ready || typeof cal.factorFor !== "function") return p;
  return clamp(p * cal.factorFor(p), 0.3, 0.995);
}