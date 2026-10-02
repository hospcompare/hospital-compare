import { formatHourly } from "@/lib/compare";

/**
 * Approved reports of one compensation type required before that statistic
 * may be shown on a public page. Hourly and annual samples are counted
 * separately. This is a display minimum, not a grade.
 */
export const MIN_PUBLIC_WORKER_SALARY_REPORTS = 5;

export const WORKER_SALARY_PUBLIC_EMPTY =
  "No approved worker-reported pay yet.";

export const WORKER_SALARY_PUBLIC_BELOW_THRESHOLD =
  "Not enough approved reports yet.";

export type WorkerSalaryCompensation = "hourly" | "annual";

/**
 * Count and median for one compensation sample.
 * Mean, min, and max may be present on the internal aggregate and are ignored.
 */
export type WorkerSalaryPublicSample = {
  count: number;
  median: number | null;
  mean?: number | null;
  min?: number | null;
  max?: number | null;
};

/**
 * Raw specialty aggregate fields the display rule is allowed to read.
 * Extra fields such as mean, min, and max may be present and are ignored.
 */
export type WorkerSalaryPublicAggregateInput = {
  approvedReportCount?: number;
  hourly: WorkerSalaryPublicSample;
  annual: WorkerSalaryPublicSample;
};

export type WorkerSalaryPublicDisplay =
  | {
      state: "eligible";
      compensation: WorkerSalaryCompensation;
      median: number;
      count: number;
    }
  | { state: "below-threshold" }
  | { state: "none" };

export type WorkerSalarySpecialtyPublicPay = {
  specialtySlug: string | null;
  /** Display label for a worker-only section. Null specialty stays unlabeled here. */
  specialtyName?: string | null;
  display: WorkerSalaryPublicDisplay;
};

function finiteMedian(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sampleCount(
  aggregate: WorkerSalaryPublicAggregateInput | null | undefined,
  compensation: WorkerSalaryCompensation,
): number | null {
  const count = aggregate?.[compensation]?.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    return null;
  }
  return count;
}

/**
 * Whether one compensation sample inside a worker-salary aggregate may be
 * shown publicly. Pass "hourly" or "annual". The two counts are never added
 * together. A sample qualifies only from its own approved count.
 */
export function isWorkerSalaryAggregatePubliclyDisplayable(
  aggregate: WorkerSalaryPublicAggregateInput | null | undefined,
  compensation: WorkerSalaryCompensation,
): boolean {
  const count = sampleCount(aggregate, compensation);
  return count != null && count >= MIN_PUBLIC_WORKER_SALARY_REPORTS;
}

function hasApprovedReports(
  aggregate: WorkerSalaryPublicAggregateInput | null | undefined,
): boolean {
  if (!aggregate) return false;
  const approved = aggregate.approvedReportCount;
  if (typeof approved === "number" && Number.isFinite(approved) && approved > 0) {
    return true;
  }
  return (
    (sampleCount(aggregate, "hourly") ?? 0) > 0 ||
    (sampleCount(aggregate, "annual") ?? 0) > 0
  );
}

function eligibleDisplay(
  aggregate: WorkerSalaryPublicAggregateInput,
  compensation: WorkerSalaryCompensation,
): WorkerSalaryPublicDisplay | null {
  if (!isWorkerSalaryAggregatePubliclyDisplayable(aggregate, compensation)) {
    return null;
  }
  const sample = aggregate[compensation];
  if (!finiteMedian(sample.median)) return null;
  return {
    state: "eligible",
    compensation,
    median: sample.median,
    count: sample.count,
  };
}

/**
 * Chooses the public worker-pay figure for one specialty aggregate.
 * Hourly median is preferred when that sample meets the display minimum.
 * Annual median is used only when hourly does not qualify and annual does.
 * The returned count is the count of the displayed sample.
 */
export function selectWorkerSalaryPublicDisplay(
  aggregate: WorkerSalaryPublicAggregateInput | null | undefined,
): WorkerSalaryPublicDisplay {
  if (aggregate) {
    const hourly = eligibleDisplay(aggregate, "hourly");
    if (hourly) return hourly;
    const annual = eligibleDisplay(aggregate, "annual");
    if (annual) return annual;
  }

  if (hasApprovedReports(aggregate)) {
    return { state: "below-threshold" };
  }

  return { state: "none" };
}

function formatAnnual(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Public figure for an eligible sample. Hourly and annual stay in their own units. */
export function formatWorkerSalaryPublicFigure(
  display: Extract<WorkerSalaryPublicDisplay, { state: "eligible" }>,
): string {
  if (display.compensation === "hourly") {
    return `${formatHourly(display.median)} median`;
  }
  return `${formatAnnual(display.median)} annual median`;
}

/** Public count label for the displayed compensation sample. */
export function formatWorkerSalaryPublicReportCount(count: number): string {
  const noun = count === 1 ? "report" : "reports";
  return `${count} approved ${noun}`;
}

/**
 * Message for a specialty that cannot show a figure.
 * The wording does not include a report count.
 */
export function workerSalaryPublicUnavailableMessage(
  display: WorkerSalaryPublicDisplay,
): string | null {
  if (display.state === "below-threshold") {
    return WORKER_SALARY_PUBLIC_BELOW_THRESHOLD;
  }
  if (display.state === "none") {
    return WORKER_SALARY_PUBLIC_EMPTY;
  }
  return null;
}

/**
 * Projects specialty aggregates down to public display records.
 * Mean, min, max, and report-level fields are not copied.
 */
export function toWorkerSalarySpecialtyPublicPay(
  specialties:
    | readonly (WorkerSalaryPublicAggregateInput & {
        specialtySlug: string | null;
        specialtyName?: string | null;
      })[]
    | null
    | undefined,
): WorkerSalarySpecialtyPublicPay[] {
  return (specialties ?? []).map((aggregate) => {
    const specialtyName = aggregate.specialtyName?.trim() || null;
    return {
      specialtySlug: aggregate.specialtySlug,
      ...(specialtyName ? { specialtyName } : {}),
      display: selectWorkerSalaryPublicDisplay(aggregate),
    };
  });
}

/** Exact specialty match. A missing specialty is the unspecified bucket, not every specialty. */
export function workerSalaryPublicDisplayForSpecialty(
  rows: readonly WorkerSalarySpecialtyPublicPay[] | null | undefined,
  specialtySlug: string | null | undefined,
): WorkerSalaryPublicDisplay {
  const wanted = specialtySlug ?? null;
  const match = (rows ?? []).find((row) => row.specialtySlug === wanted);
  return match?.display ?? { state: "none" };
}
