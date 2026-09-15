import type { ColIndexMetric, SalaryMetric } from "@/lib/contracts";

/** National-average COL index in the seed dataset. */
export const NATIONAL_COL_INDEX = 100;

/**
 * Convert a nominal hourly rate into purchasing-power terms.
 * real = nominal / (colIndex / 100)
 * A 140 COL market makes $70/hr worth about $50 in a 100-index area.
 */
export function colAdjustedHourly(
  hourlyMid: number | null | undefined,
  colIndex: number | null | undefined,
): number | null {
  if (
    hourlyMid == null ||
    !Number.isFinite(hourlyMid) ||
    colIndex == null ||
    !Number.isFinite(colIndex) ||
    colIndex <= 0
  ) {
    return null;
  }
  return hourlyMid / (colIndex / NATIONAL_COL_INDEX);
}

export function hourlyMid(salary: Pick<SalaryMetric, "hourlyMin" | "hourlyMax">) {
  return (salary.hourlyMin + salary.hourlyMax) / 2;
}

export function formatHourly(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${value.toFixed(2)}/hr`;
}

export function formatScore(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(1);
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function pickSalaryForRole(
  salaries: SalaryMetric[],
  role: string,
): SalaryMetric | null {
  const exact = salaries.find((row) => row.role.toLowerCase() === role.toLowerCase());
  if (exact) return exact;
  const fuzzy = salaries.find((row) =>
    row.role.toLowerCase().includes(role.toLowerCase()),
  );
  return fuzzy ?? salaries[0] ?? null;
}

export function colAdjustedFrom(
  salary: SalaryMetric | null,
  col: ColIndexMetric | null,
) {
  if (!salary || !col) return null;
  return colAdjustedHourly(salary.hourlyMid, col.indexValue);
}
