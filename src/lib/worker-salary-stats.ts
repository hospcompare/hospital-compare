import type { WorkerSalaryStatistic } from "@/lib/contracts";

/** One approved report reduced to the values the aggregate is allowed to use. */
export type WorkerSalaryReportSample = {
  specialtySlug: string | null;
  hourlyRate: number | null;
  annualSalary: number | null;
};

/**
 * Approved worker-pay aggregate for one specialty.
 * specialtySlug null is the unspecified bucket only. It is not a profession-wide rollup.
 */
export type WorkerSalarySpecialtyAggregate = {
  specialtySlug: string | null;
  approvedReportCount: number;
  hourly: WorkerSalaryStatistic;
  annual: WorkerSalaryStatistic;
};

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

function finitePay(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Groups already-filtered approved samples by specialty and summarizes each
 * group with the same hourly and annual math as a single-specialty aggregate.
 * Callers must limit the samples to one hospital and one profession first.
 * A null specialty stays in its own group. Other specialties are not merged in.
 */
export function aggregateWorkerSalarySamplesBySpecialty(
  reports: readonly WorkerSalaryReportSample[],
): WorkerSalarySpecialtyAggregate[] {
  const groups = new Map<
    string | null,
    {
      specialtySlug: string | null;
      count: number;
      hourly: number[];
      annual: number[];
    }
  >();

  for (const report of reports) {
    const specialtySlug = report.specialtySlug;
    let group = groups.get(specialtySlug);
    if (!group) {
      group = { specialtySlug, count: 0, hourly: [], annual: [] };
      groups.set(specialtySlug, group);
    }
    group.count += 1;
    if (finitePay(report.hourlyRate)) group.hourly.push(report.hourlyRate);
    if (finitePay(report.annualSalary)) group.annual.push(report.annualSalary);
  }

  return [...groups.values()]
    .map((group) => ({
      specialtySlug: group.specialtySlug,
      approvedReportCount: group.count,
      hourly: summarizePayValues(group.hourly),
      annual: summarizePayValues(group.annual),
    }))
    .sort((left, right) => {
      if (left.specialtySlug == null && right.specialtySlug == null) return 0;
      if (left.specialtySlug == null) return 1;
      if (right.specialtySlug == null) return -1;
      return left.specialtySlug.localeCompare(right.specialtySlug);
    });
}
