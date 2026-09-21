import { OewsAdapterError } from "./errors";

const WAGE_SCALE = 2;
/** Absolute cents of slack allowed for IEEE values stored by Excel. */
const FLOAT_NOISE_CENTS = 1e-4;

export type ParsedWage =
  | { kind: "value"; value: string }
  | { kind: "blank" }
  | { kind: "unavailable" }
  | { kind: "top-coded" }
  | { kind: "employment-unavailable" };

/**
 * Convert one official OEWS wage cell into a normalized decimal or null.
 * Suppression and non-publish markers stay null. Published numbers are not
 * interpolated. Excel's binary float text (for example 40.950000000000003)
 * is accepted only when it is already a 2-decimal published value.
 */
export function parseWageCell(
  raw: string,
  fieldName: string,
  integerDigits: number,
): ParsedWage {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return { kind: "blank" };
  }
  if (trimmed === "*") {
    return { kind: "unavailable" };
  }
  if (trimmed === "#") {
    return { kind: "top-coded" };
  }
  if (trimmed === "**") {
    return { kind: "employment-unavailable" };
  }
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new OewsAdapterError(
      `${fieldName} has an unrecognized OEWS wage marker ${JSON.stringify(trimmed)}`,
    );
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    throw new OewsAdapterError(
      `${fieldName} is not a finite published wage: ${JSON.stringify(trimmed)}`,
    );
  }

  const scaled = value * 10 ** WAGE_SCALE;
  const nearest = Math.round(scaled);
  if (Math.abs(scaled - nearest) > FLOAT_NOISE_CENTS) {
    throw new OewsAdapterError(
      `${fieldName} is not a published 2-decimal wage and was not rounded: ${JSON.stringify(trimmed)}`,
    );
  }

  const whole = Math.trunc(nearest / 100);
  const fraction = String(Math.abs(nearest % 100)).padStart(WAGE_SCALE, "0");
  if (String(whole).length > integerDigits) {
    throw new OewsAdapterError(
      `${fieldName} exceeds Decimal storage bounds: ${JSON.stringify(trimmed)}`,
    );
  }

  return { kind: "value", value: `${whole}.${fraction}` };
}

export function wageValue(parsed: ParsedWage) {
  return parsed.kind === "value" ? parsed.value : null;
}
