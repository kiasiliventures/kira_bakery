export function computeNextDelayMs(attempt: number, rng: () => number = Math.random) {
  const baseMs = 30_000;
  const capMs = 3_600_000;
  const raw = Math.min(capMs, baseMs * Math.pow(2, Math.max(0, attempt - 1)));
  const jitterFactor = 0.5 + rng(); // rng returns [0,1) => jitterFactor in [0.5,1.5)
  return Math.round(raw * jitterFactor);
}
