import type { WorkerSalaryStatistic } from "@/lib/contracts";

/**
 * Median of a sample.
 * Odd count: the middle value after sorting.
 * Even count: the arithmetic mean of the two middle values after sorting.
 * Empty input has no median.
 */
export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? null;
  }

  const lower = sorted[mid - 1];
  const upper = sorted[mid];
  if (lower == null || upper == null) return null;
  return (lower + upper) / 2;
}

/** count, median, mean, min, and max. Empty input returns count 0 and null statistics. */
export function summarizePayValues(values: number[]): WorkerSalaryStatistic {
  if (values.length === 0) {
    return {
      count: 0,
      median: null,
      mean: null,
      min: null,
      max: null,
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const min = sorted[0] ?? null;
  const max = sorted[sorted.length - 1] ?? null;

  return {
    count: sorted.length,
    median: medianOf(sorted),
    mean: sum / sorted.length,
    min,
    max,
  };
}
