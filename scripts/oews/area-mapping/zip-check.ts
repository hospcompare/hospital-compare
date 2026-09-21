import type { HospitalAreaMatch, HospitalGeoInput } from "./types";

export type ZctaCountyPart = {
  countyFips: string;
  land: number;
};

/** Census 2020 ZCTA-to-county relationship, aggregated by land area. */
export function indexZctaCounties(text: string): Map<string, ZctaCountyPart[]> {
  const lines = text.split(/\r?\n/);
  const header = lines[0]?.replace(/^\uFEFF/, "").split("|") ?? [];
  const zctaIndex = header.indexOf("GEOID_ZCTA5_20");
  const countyIndex = header.indexOf("GEOID_COUNTY_20");
  const landIndex = header.indexOf("AREALAND_PART");
  if (zctaIndex < 0 || countyIndex < 0 || landIndex < 0) {
    throw new Error("ZCTA relationship file is missing expected columns");
  }

  const totals = new Map<string, Map<string, number>>();
  for (const line of lines.slice(1)) {
    if (!line) {
      continue;
    }
    const fields = line.split("|");
    const zcta = fields[zctaIndex] ?? "";
    const countyFips = fields[countyIndex] ?? "";
    const land = Number(fields[landIndex] ?? "");
    if (!/^\d{5}$/.test(zcta) || !/^\d{5}$/.test(countyFips)) {
      continue;
    }
    if (!Number.isFinite(land) || land <= 0) {
      continue;
    }
    const byCounty = totals.get(zcta) ?? new Map<string, number>();
    byCounty.set(countyFips, (byCounty.get(countyFips) ?? 0) + land);
    totals.set(zcta, byCounty);
  }

  const indexed = new Map<string, ZctaCountyPart[]>();
  for (const [zcta, byCounty] of totals) {
    indexed.set(
      zcta,
      [...byCounty.entries()]
        .map(([countyFips, land]) => ({ countyFips, land }))
        .sort((left, right) => right.land - left.land),
    );
  }
  return indexed;
}

export function zip5(value: string): string | null {
  const digits = value.trim().slice(0, 5);
  return /^\d{5}$/.test(digits) ? digits : null;
}

export type ZipCheckSummary = {
  hospitalCount: number;
  invalidZip: number;
  zipNotInZcta: number;
  /** ZCTA counties are not in the May 2025 OEWS county crosswalk (for example 2020 Connecticut counties). */
  zipCountyNotInCrosswalk: number;
  singleCountyAgrees: number;
  singleCountyDisagrees: number;
  multiCountySameOewsArea: number;
  multiCountyPluralityAgrees: number;
  multiCountyPluralityDisagrees: number;
  /** Mapped hospitals, excluding Connecticut, where plurality-land ZCTA county points at a different OEWS area. */
  zipOnlyWouldDisagreeExcludingConnecticut: number;
  connecticutMapped: number;
  zctasSpanningMultipleOewsAreas: number;
  hospitalZipsSpanningMultipleOewsAreas: number;
};

export function summarizeZipCheck(input: {
  hospitals: HospitalGeoInput[];
  matches: HospitalAreaMatch[];
  zcta: Map<string, ZctaCountyPart[]>;
  areaCodeByCountyFips: Map<string, string>;
}): ZipCheckSummary {
  const matchByCcn = new Map(input.matches.map((match) => [match.ccn, match]));
  const summary: ZipCheckSummary = {
    hospitalCount: input.hospitals.length,
    invalidZip: 0,
    zipNotInZcta: 0,
    zipCountyNotInCrosswalk: 0,
    singleCountyAgrees: 0,
    singleCountyDisagrees: 0,
    multiCountySameOewsArea: 0,
    multiCountyPluralityAgrees: 0,
    multiCountyPluralityDisagrees: 0,
    zipOnlyWouldDisagreeExcludingConnecticut: 0,
    connecticutMapped: 0,
    zctasSpanningMultipleOewsAreas: 0,
    hospitalZipsSpanningMultipleOewsAreas: 0,
  };

  for (const parts of input.zcta.values()) {
    const areas = new Set(
      parts
        .map((part) => input.areaCodeByCountyFips.get(part.countyFips))
        .filter((code): code is string => Boolean(code)),
    );
    if (areas.size > 1) {
      summary.zctasSpanningMultipleOewsAreas += 1;
    }
  }

  const hospitalZipsSpanning = new Set<string>();
  for (const hospital of input.hospitals) {
    const match = matchByCcn.get(hospital.ccn);
    const zip = zip5(hospital.zip);
    if (!zip) {
      summary.invalidZip += 1;
      continue;
    }
    const parts = input.zcta.get(zip);
    if (!parts || parts.length === 0) {
      summary.zipNotInZcta += 1;
      continue;
    }
    const areaCodes = parts.map((part) =>
      input.areaCodeByCountyFips.get(part.countyFips),
    );
    if (hospital.state === "CT" && match?.status === "mapped") {
      summary.connecticutMapped += 1;
    }
    if (areaCodes.some((code) => !code)) {
      summary.zipCountyNotInCrosswalk += 1;
      continue;
    }
    const distinctAreas = new Set(areaCodes);
    if (distinctAreas.size > 1) {
      hospitalZipsSpanning.add(zip);
    }
    if (match?.status !== "mapped") {
      continue;
    }
    const plurality = areaCodes[0] ?? null;
    const agrees = match.geographicAreaCode === plurality;
    if (parts.length === 1) {
      if (agrees) {
        summary.singleCountyAgrees += 1;
      } else {
        summary.singleCountyDisagrees += 1;
      }
    } else if (distinctAreas.size === 1) {
      summary.multiCountySameOewsArea += 1;
    } else if (agrees) {
      summary.multiCountyPluralityAgrees += 1;
    } else {
      summary.multiCountyPluralityDisagrees += 1;
    }
    if (hospital.state !== "CT" && !agrees) {
      summary.zipOnlyWouldDisagreeExcludingConnecticut += 1;
    }
  }
  summary.hospitalZipsSpanningMultipleOewsAreas = hospitalZipsSpanning.size;
  return summary;
}
