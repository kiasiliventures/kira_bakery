import { describe, expect, it } from 'vitest';
import { computeNextDelayMs } from '@/lib/push/retry-schedule';

describe('retry schedule', () => {
  it('computes base delay for first attempt with deterministic rng', () => {
    const delay = computeNextDelayMs(1, () => 0.5); // jitterFactor = 1.0
    expect(delay).toBe(30_000);
  });

  it('doubles per attempt and caps at 1 hour', () => {
    const delay2 = computeNextDelayMs(2, () => 0.5);
    expect(delay2).toBe(60_000);

    const delay10 = computeNextDelayMs(10, () => 0.5);
    expect(delay10).toBe(3_600_000);
  });

  it('applies jitter in range', () => {
    const min = computeNextDelayMs(1, () => 0); // jitterFactor = 0.5 => 15s
    const max = computeNextDelayMs(1, () => 0.99); // jitterFactor ~= 1.49 => ~44.7s
    expect(min).toBeGreaterThanOrEqual(15_000);
    expect(max).toBeLessThanOrEqual(45_000);
  });
});
