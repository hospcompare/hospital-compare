import { formatHourly } from "@/lib/compare";
import type {
  LocalPayBenchmarkLookup,
  LocalPayBenchmarkValues,
} from "@/lib/contracts";

const MARKET_UNAVAILABLE = "Local pay benchmark unavailable for this market.";
const HOSPITAL_UNAVAILABLE =
  "Local pay benchmark unavailable for this hospital.";

const MONTH_ABBREVIATIONS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type LocalBenchmarkPresentation = {
  heading: string;
  context: string;
  figure: string | null;
  unavailable: string | null;
  marketName: string | null;
  source: string | null;
  sourceUrl: string | null;
  release: string | null;
};

function finiteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatAnnual(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * One profession-level figure for the supplied row.
 * Hourly median, then hourly mean, then annual median, then annual mean.
 * A missing value does not select another area or another release.
 */
export function formatLocalBenchmarkFigure(
  benchmark: LocalPayBenchmarkValues,
): string | null {
  if (finiteNumber(benchmark.hourlyMedian)) {
    return `${formatHourly(benchmark.hourlyMedian)} median`;
  }
  if (finiteNumber(benchmark.hourlyMean)) {
    return `${formatHourly(benchmark.hourlyMean)} mean`;
  }
  if (finiteNumber(benchmark.annualMedian)) {
    return `${formatAnnual(benchmark.annualMedian)} annual median`;
  }
  if (finiteNumber(benchmark.annualMean)) {
    return `${formatAnnual(benchmark.annualMean)} annual mean`;
  }
  return null;
}

function releaseFromDataset(sourceDataset: string) {
  const match = /^OEWS-(\d{4})-([A-Z]{3})$/.exec(sourceDataset.trim());
  if (!match) return null;
  const index = MONTH_ABBREVIATIONS.indexOf(
    match[2] as (typeof MONTH_ABBREVIATIONS)[number],
  );
  if (index < 0) return null;
  return `${MONTH_LABELS[index]} ${match[1]}`;
}

function compactEffectiveDate(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const monthYear = `${MONTH_LABELS[month - 1]} ${year}`;
  return {
    label: day === 1 ? monthYear : `${MONTH_LABELS[month - 1]} ${day}, ${year}`,
    monthYear,
  };
}

/** Release label, with the effective date appended only when it names a different period. */
export function compactBenchmarkRelease(
  sourceDataset: string,
  effectiveDate: string | null,
) {
  const release = releaseFromDataset(sourceDataset);
  const effective = effectiveDate ? compactEffectiveDate(effectiveDate) : null;
  if (release && effective) {
    if (release === effective.monthYear) return release;
    return `${release} · ${effective.label}`;
  }
  if (release) return release;
  if (effective) return effective.label;
  const dataset = sourceDataset.trim();
  return dataset || null;
}

function professionName(
  lookup: LocalPayBenchmarkLookup | null,
  professionLabel: string,
) {
  const name = lookup?.profession.name.trim();
  if (name) return name;
  const fallback = professionLabel.trim();
  return fallback || "this profession";
}

function professionShortLabel(
  lookup: LocalPayBenchmarkLookup | null,
  professionLabel: string,
) {
  const abbreviation = lookup?.profession.abbreviation?.trim();
  if (abbreviation) return abbreviation;
  return professionName(lookup, professionLabel);
}

export function presentLocalPayBenchmark(
  lookup: LocalPayBenchmarkLookup | null,
  professionLabel: string,
): LocalBenchmarkPresentation {
  const name = professionName(lookup, professionLabel);
  const benchmark = lookup?.benchmark ?? null;
  const figure = benchmark ? formatLocalBenchmarkFigure(benchmark) : null;
  const hasGeography = lookup?.geography != null;
  const marketName = lookup?.geography?.geographicAreaName.trim() || null;
  const source = benchmark?.source.trim() || null;

  return {
    heading: `Local ${professionShortLabel(lookup, professionLabel)} benchmark`,
    context: `Local labor-market benchmark for ${name}. Not this hospital's pay, and not specialty-specific.`,
    figure,
    unavailable: figure
      ? null
      : hasGeography
        ? MARKET_UNAVAILABLE
        : HOSPITAL_UNAVAILABLE,
    marketName,
    source,
    sourceUrl: source ? benchmark?.sourceUrl ?? null : null,
    release: benchmark
      ? compactBenchmarkRelease(benchmark.sourceDataset, benchmark.effectiveDate)
      : null,
  };
}
