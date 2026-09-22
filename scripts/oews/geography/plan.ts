/**
 * Pure plan for HospitalCountyResolution and OewsAreaCounty.
 *
 * Hospital rows name the Census county vintage. OEWS rows name the BLS
 * May 2025 area-definition release. Those identities are not interchangeable.
 * This module does not open a database connection.
 */
import {
  OEWS_MAY_2025_DATASET,
  OEWS_MAY_2025_SOURCE,
} from "../may-2025/constants";
import { STATE_FIPS_TO_ABBREV, normalizeGeographyName } from "../area-mapping/names";
import type { BlsAreaDefinition } from "../area-mapping/sources";
import type {
  CensusCounty,
  HospitalAreaMatch,
  HospitalGeoInput,
} from "../area-mapping/types";

export const HOSPITAL_COUNTY_SOURCE = "Census Bureau";
export const HOSPITAL_COUNTY_DATASET = "all-geocodes-v2024";

export const OEWS_AREA_COUNTY_SOURCE = OEWS_MAY_2025_SOURCE;
export const OEWS_AREA_COUNTY_DATASET = OEWS_MAY_2025_DATASET;

/** Official May 2025 area-definition workbook county row count. */
export const EXPECTED_OEWS_COUNTY_MAPPINGS = 3222;

/**
 * CMS extract counts from the September 2026 read-only prototype.
 * Live CMS extracts can move. A difference is reported; it is not itself
 * a structural validation failure.
 */
export const PROTOTYPE_HOSPITAL_RESOLUTIONS = 5408;
export const PROTOTYPE_UNRESOLVED_HOSPITALS = 11;

const COUNTY_FIPS = /^\d{5}$/;
const STATE_FIPS = /^\d{2}$/;
const STATE_CODE = /^[A-Z]{2}$/;
const METRO_AREA_CODE = /^\d{5}$/;
const NONMETRO_AREA_CODE = /^\d{7}$/;

const GEOGRAPHIC_LEVELS = new Set([
  "Metropolitan Statistical Area",
  "Nonmetropolitan Area",
]);

const MAPPED_METHODS = new Set([
  "census_name",
  "census_suffix",
  "compact_spelling",
  "county_rather_than_independent_city",
  "cms_published_alias",
  "cms_compass_abbreviation",
  "ct_town_subdivision",
]);

const UNRESOLVED_REASONS: Record<string, string> = {
  outside_oews_metro_nonmetro_coverage:
    "Territory has no May 2025 metropolitan or nonmetropolitan OEWS area",
  missing_county: "CMS county/parish is blank",
  retired_census_area:
    "CMS county is a retired census area and is not one current county",
  ct_town_unmatched:
    "Connecticut CMS city is not a Census town, so the planning region cannot be resolved",
  county_not_in_oews_definitions:
    "Census county has no row in the May 2025 OEWS area definitions",
  county_name_unmatched:
    "CMS county name did not match one Census county equivalent in that state",
};

export const VERIFICATION_HOSPITALS = [
  {
    ccn: "500039",
    label: "St. Michael Medical Center, Silverdale, WA",
    countyHint: "Kitsap",
    expectedAreaCode: "14740",
  },
  {
    ccn: "520098",
    label: "UW Hospitals, Madison, WI",
    countyHint: "Dane",
    expectedAreaCode: "31540",
  },
  {
    ccn: "340069",
    label: "WakeMed Raleigh Campus, Raleigh, NC",
    countyHint: "Wake",
    expectedAreaCode: "39580",
  },
  {
    ccn: "340173",
    label: "WakeMed Cary Hospital, Cary, NC",
    countyHint: "Wake",
    expectedAreaCode: "39580",
  },
  {
    ccn: "500064",
    label: "Harborview Medical Center, Seattle, WA",
    countyHint: "King",
    expectedAreaCode: "42660",
  },
] as const;

export type HospitalCountyPlanRow = {
  hospitalCcn: string;
  countyFips: string;
  countyName: string;
  stateFips: string;
  stateCode: string;
  source: string;
  sourceDataset: string;
  resolutionMethod: string;
};

export type OewsAreaCountyPlanRow = {
  countyFips: string;
  geographicAreaCode: string;
  geographicAreaName: string;
  geographicLevel: string;
  source: string;
  sourceDataset: string;
};

export type UnresolvedHospital = {
  ccn: string;
  name: string;
  city: string;
  state: string;
  county: string | null;
  method: string;
  reason: string;
};

export type CountyWithoutBenchmarkArea = {
  countyFips: string;
  countyName: string;
  geographicAreaCode: string;
  geographicAreaName: string;
};

export type VerificationResult = {
  ccn: string;
  label: string;
  countyHint: string;
  expectedAreaCode: string;
  present: boolean;
  countyFips: string | null;
  countyName: string | null;
  stateCode: string | null;
  geographicAreaCode: string | null;
  geographicAreaName: string | null;
  geographicLevel: string | null;
  resolutionMethod: string | null;
  ok: boolean;
  detail: string;
};

export type GeographyPlanSummary = {
  totalHospitals: number;
  resolved: number;
  unresolved: number;
  metroMapped: number;
  nonmetroMapped: number;
  territoryUnmappable: number;
  hospitalCountyResolutions: number;
  oewsCountyMappings: number;
  duplicateLogicalIdentities: number;
  countiesWithoutBenchmarkArea: number;
};

export type GeographyPlan = {
  hospitalResolutions: HospitalCountyPlanRow[];
  oewsAreaCounties: OewsAreaCountyPlanRow[];
  unresolved: UnresolvedHospital[];
  countiesWithoutBenchmarkArea: CountyWithoutBenchmarkArea[];
  verification: VerificationResult[];
  validationErrors: string[];
  summary: GeographyPlanSummary;
};

export function unresolvedReason(method: string) {
  return UNRESOLVED_REASONS[method] ?? `Unresolved (${method})`;
}

function pushError(errors: string[], message: string) {
  if (errors.length < 50) {
    errors.push(message);
  } else if (errors.length === 50) {
    errors.push("Further validation errors were omitted from this list.");
  }
}

function censusFips(county: CensusCounty) {
  return `${county.stateFips}${county.countyFips3}`;
}

export function buildGeographyPlan(input: {
  hospitals: HospitalGeoInput[];
  matches: HospitalAreaMatch[];
  counties: CensusCounty[];
  definitions: BlsAreaDefinition[];
  benchmarkAreaCodes: ReadonlySet<string>;
  /**
   * True for the May 2025 workbook population. Requires 3,222 county rows.
   * Synthetic tests set this to false.
   */
  officialRelease: boolean;
  /**
   * The CMS population path passes the full Census vintage and requires every
   * OEWS county to be in it. Fixture tests pass a county subset and set this
   * to false.
   */
  checkCensusCoverage: boolean;
  /**
   * Default CMS runs require the four prototype hospitals. A caller-supplied
   * hospital file only checks the verification CCNs that file contains.
   */
  requireVerificationHospitals: boolean;
}): GeographyPlan {
  const validationErrors: string[] = [];
  let duplicateLogicalIdentities = 0;

  if (input.hospitals.length !== input.matches.length) {
    pushError(
      validationErrors,
      `Resolver returned ${input.matches.length} results for ${input.hospitals.length} hospitals`,
    );
  }

  if (
    input.officialRelease &&
    input.definitions.length !== EXPECTED_OEWS_COUNTY_MAPPINGS
  ) {
    pushError(
      validationErrors,
      `May 2025 area definitions contain ${input.definitions.length} county rows; expected ${EXPECTED_OEWS_COUNTY_MAPPINGS}`,
    );
  }

  const censusByFips = new Map<string, CensusCounty>();
  for (const county of input.counties) {
    if (!STATE_FIPS.test(county.stateFips) || !/^\d{3}$/.test(county.countyFips3)) {
      pushError(
        validationErrors,
        `Census FIPS for ${county.name} is not zero-padded text (${county.stateFips}${county.countyFips3})`,
      );
      continue;
    }
    const fips = censusFips(county);
    if (censusByFips.has(fips)) {
      duplicateLogicalIdentities += 1;
      pushError(validationErrors, `Duplicate Census county FIPS ${fips}`);
      continue;
    }
    censusByFips.set(fips, county);
  }

  const oewsByFips = new Map<string, OewsAreaCountyPlanRow[]>();
  const definitionNames = new Map<string, string>();

  for (const definition of input.definitions) {
    definitionNames.set(definition.countyFips, definition.countyName);
    const row = oewsRowFromDefinition(definition, validationErrors);
    if (!row) {
      continue;
    }
    const group = oewsByFips.get(row.countyFips) ?? [];
    group.push(row);
    oewsByFips.set(row.countyFips, group);
  }

  const oewsAreaCounties: OewsAreaCountyPlanRow[] = [];
  const countiesWithoutBenchmarkArea: CountyWithoutBenchmarkArea[] = [];

  for (const [countyFips, rows] of oewsByFips) {
    if (rows.length > 1) {
      duplicateLogicalIdentities += 1;
      const areas = [...new Set(rows.map((row) => row.geographicAreaCode))];
      pushError(
        validationErrors,
        areas.length > 1
          ? `County ${countyFips} maps to more than one OEWS area in ${OEWS_AREA_COUNTY_DATASET}: ${areas.join(", ")}`
          : `Duplicate OEWS county identity ${countyFips} + ${OEWS_AREA_COUNTY_SOURCE} + ${OEWS_AREA_COUNTY_DATASET}`,
      );
      continue;
    }

    const row = rows[0];
    if (!input.benchmarkAreaCodes.has(row.geographicAreaCode)) {
      countiesWithoutBenchmarkArea.push({
        countyFips: row.countyFips,
        countyName: definitionNames.get(countyFips) ?? "",
        geographicAreaCode: row.geographicAreaCode,
        geographicAreaName: row.geographicAreaName,
      });
      pushError(
        validationErrors,
        `County ${countyFips} area ${row.geographicAreaCode} has no corresponding May 2025 benchmark area`,
      );
    }

    if (input.checkCensusCoverage || censusByFips.has(countyFips)) {
      const censusCounty = censusByFips.get(countyFips);
      if (!censusCounty) {
        pushError(
          validationErrors,
          `OEWS county ${countyFips} is not in Census vintage ${HOSPITAL_COUNTY_DATASET}`,
        );
      } else if (
        normalizeGeographyName(censusCounty.name) !==
        normalizeGeographyName(definitionNames.get(countyFips) ?? "")
      ) {
        pushError(
          validationErrors,
          `County ${countyFips} Census "${censusCounty.name}" does not match OEWS county "${definitionNames.get(countyFips) ?? ""}"`,
        );
      }
    }

    oewsAreaCounties.push(row);
  }

  oewsAreaCounties.sort((left, right) =>
    left.countyFips.localeCompare(right.countyFips),
  );

  const areaByCounty = new Map(
    oewsAreaCounties.map((row) => [row.countyFips, row]),
  );

  const ccnCounts = new Map<string, number>();
  for (const hospital of input.hospitals) {
    ccnCounts.set(hospital.ccn, (ccnCounts.get(hospital.ccn) ?? 0) + 1);
  }
  const duplicateCcns = new Set(
    [...ccnCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([ccn]) => ccn),
  );
  duplicateLogicalIdentities += duplicateCcns.size;
  for (const ccn of duplicateCcns) {
    pushError(
      validationErrors,
      `Duplicate hospital logical identity ${ccn} + ${HOSPITAL_COUNTY_SOURCE} + ${HOSPITAL_COUNTY_DATASET}`,
    );
  }

  const matchByCcn = new Map<string, HospitalAreaMatch[]>();
  for (const match of input.matches) {
    const group = matchByCcn.get(match.ccn) ?? [];
    group.push(match);
    matchByCcn.set(match.ccn, group);
  }

  const hospitalResolutions: HospitalCountyPlanRow[] = [];
  const unresolved: UnresolvedHospital[] = [];
  const seenResolution = new Set<string>();
  let metroMapped = 0;
  let nonmetroMapped = 0;
  let territoryUnmappable = 0;

  for (const hospital of input.hospitals) {
    if (duplicateCcns.has(hospital.ccn)) {
      continue;
    }
    const matches = matchByCcn.get(hospital.ccn) ?? [];
    if (matches.length !== 1) {
      pushError(
        validationErrors,
        `Hospital ${hospital.ccn} has ${matches.length} resolver results`,
      );
      continue;
    }
    const match = matches[0];
    if (match.status === "unmapped") {
      if (match.method === "outside_oews_metro_nonmetro_coverage") {
        territoryUnmappable += 1;
      }
      unresolved.push({
        ccn: hospital.ccn,
        name: hospital.name,
        city: hospital.city,
        state: hospital.state,
        county: hospital.county,
        method: match.method,
        reason: unresolvedReason(match.method),
      });
      continue;
    }

    const row = hospitalRowFromMatch(
      hospital,
      match,
      censusByFips,
      areaByCounty,
      validationErrors,
    );
    if (!row) {
      continue;
    }
    const identity = `${row.hospitalCcn}\0${row.source}\0${row.sourceDataset}`;
    if (seenResolution.has(identity)) {
      duplicateLogicalIdentities += 1;
      pushError(
        validationErrors,
        `Duplicate hospital logical identity ${row.hospitalCcn} + ${row.source} + ${row.sourceDataset}`,
      );
      continue;
    }
    seenResolution.add(identity);
    hospitalResolutions.push(row);
    const area = areaByCounty.get(row.countyFips);
    if (area?.geographicLevel === "Metropolitan Statistical Area") {
      metroMapped += 1;
    } else if (area?.geographicLevel === "Nonmetropolitan Area") {
      nonmetroMapped += 1;
    }
  }

  hospitalResolutions.sort((left, right) =>
    left.hospitalCcn.localeCompare(right.hospitalCcn),
  );
  unresolved.sort((left, right) => left.ccn.localeCompare(right.ccn));

  const hospitalsByCcn = new Map(
    input.hospitals.map((hospital) => [hospital.ccn, hospital]),
  );
  const resolutionByCcn = new Map(
    hospitalResolutions.map((row) => [row.hospitalCcn, row]),
  );
  const verification = VERIFICATION_HOSPITALS.map((expected) =>
    verifyHospital(
      expected,
      hospitalsByCcn,
      resolutionByCcn,
      areaByCounty,
      unresolved,
    ),
  );

  for (const result of verification) {
    const inFile = hospitalsByCcn.has(result.ccn);
    if (input.requireVerificationHospitals && !inFile) {
      pushError(
        validationErrors,
        `Verification hospital ${result.ccn} ${result.label} is missing from the CMS extract`,
      );
      continue;
    }
    if (inFile && !result.ok) {
      pushError(
        validationErrors,
        `Verification hospital ${result.ccn} ${result.label} failed: ${result.detail}`,
      );
    }
  }

  if (
    input.officialRelease &&
    oewsAreaCounties.length !== EXPECTED_OEWS_COUNTY_MAPPINGS &&
    !validationErrors.some((error) =>
      error.startsWith("May 2025 area definitions contain"),
    )
  ) {
    pushError(
      validationErrors,
      `OEWS county plan has ${oewsAreaCounties.length} rows; expected ${EXPECTED_OEWS_COUNTY_MAPPINGS}`,
    );
  }

  return {
    hospitalResolutions,
    oewsAreaCounties,
    unresolved,
    countiesWithoutBenchmarkArea,
    verification,
    validationErrors,
    summary: {
      totalHospitals: input.hospitals.length,
      resolved: hospitalResolutions.length,
      unresolved: unresolved.length,
      metroMapped,
      nonmetroMapped,
      territoryUnmappable,
      hospitalCountyResolutions: hospitalResolutions.length,
      oewsCountyMappings: oewsAreaCounties.length,
      duplicateLogicalIdentities,
      countiesWithoutBenchmarkArea: countiesWithoutBenchmarkArea.length,
    },
  };
}

function oewsRowFromDefinition(
  definition: BlsAreaDefinition,
  validationErrors: string[],
): OewsAreaCountyPlanRow | null {
  const problems: string[] = [];
  if (!COUNTY_FIPS.test(definition.countyFips)) {
    problems.push(
      `county FIPS "${definition.countyFips}" must be 5 digits with leading zeroes preserved`,
    );
  }
  if (!STATE_FIPS.test(definition.stateFips)) {
    problems.push(
      `state FIPS "${definition.stateFips}" must be 2 digits with leading zeroes preserved`,
    );
  } else if (
    definition.countyFips.length === 5 &&
    definition.countyFips.slice(0, 2) !== definition.stateFips
  ) {
    problems.push(
      `county FIPS ${definition.countyFips} does not start with state FIPS ${definition.stateFips}`,
    );
  }
  const stateFromFips = STATE_FIPS_TO_ABBREV[definition.stateFips];
  if (!stateFromFips || !STATE_CODE.test(definition.stateAbbrev)) {
    problems.push(
      `state abbreviation "${definition.stateAbbrev}" is not valid for FIPS ${definition.stateFips}`,
    );
  } else if (stateFromFips !== definition.stateAbbrev) {
    problems.push(
      `state abbreviation ${definition.stateAbbrev} does not match FIPS ${definition.stateFips} (${stateFromFips})`,
    );
  }
  if (!GEOGRAPHIC_LEVELS.has(definition.geographicLevel)) {
    problems.push(
      `geographic level "${definition.geographicLevel}" is not a May 2025 benchmark level`,
    );
  }
  const areaCode = definition.geographicAreaCode;
  if (definition.geographicLevel === "Metropolitan Statistical Area") {
    if (!METRO_AREA_CODE.test(areaCode)) {
      problems.push(
        `metropolitan area code "${areaCode}" must be 5 digits with leading zeroes preserved`,
      );
    }
  } else if (definition.geographicLevel === "Nonmetropolitan Area") {
    if (!NONMETRO_AREA_CODE.test(areaCode)) {
      problems.push(
        `nonmetropolitan area code "${areaCode}" must be 7 digits with leading zeroes preserved`,
      );
    }
  }
  if (!definition.geographicAreaName.trim()) {
    problems.push("geographic area name is blank");
  }
  if (problems.length > 0) {
    pushError(
      validationErrors,
      `OEWS county ${definition.countyFips || "(blank)"}: ${problems.join("; ")}`,
    );
    return null;
  }

  return {
    countyFips: definition.countyFips,
    geographicAreaCode: definition.geographicAreaCode,
    geographicAreaName: definition.geographicAreaName,
    geographicLevel: definition.geographicLevel,
    source: OEWS_AREA_COUNTY_SOURCE,
    sourceDataset: OEWS_AREA_COUNTY_DATASET,
  };
}

function hospitalRowFromMatch(
  hospital: HospitalGeoInput,
  match: HospitalAreaMatch,
  censusByFips: Map<string, CensusCounty>,
  areaByCounty: Map<string, OewsAreaCountyPlanRow>,
  validationErrors: string[],
): HospitalCountyPlanRow | null {
  const problems: string[] = [];
  const countyFips = match.countyFips ?? "";
  if (!COUNTY_FIPS.test(countyFips)) {
    problems.push(
      `county FIPS "${countyFips}" must be 5 digits with leading zeroes preserved`,
    );
  }
  if (!MAPPED_METHODS.has(match.method)) {
    problems.push(`resolution method "${match.method}" is not a mapped method`);
  }
  const censusCounty = COUNTY_FIPS.test(countyFips)
    ? censusByFips.get(countyFips)
    : undefined;
  if (COUNTY_FIPS.test(countyFips) && !censusCounty) {
    problems.push(
      `county FIPS ${countyFips} is not in Census vintage ${HOSPITAL_COUNTY_DATASET}`,
    );
  }
  const stateFips = censusCounty?.stateFips ?? "";
  const stateCode = censusCounty?.stateAbbrev ?? "";
  if (censusCounty) {
    if (!STATE_FIPS.test(stateFips)) {
      problems.push(`state FIPS "${stateFips}" is not 2 zero-padded digits`);
    }
    if (countyFips.slice(0, 2) !== stateFips) {
      problems.push(
        `county FIPS ${countyFips} does not start with state FIPS ${stateFips}`,
      );
    }
    if (!STATE_CODE.test(stateCode) || STATE_FIPS_TO_ABBREV[stateFips] !== stateCode) {
      problems.push(`state code "${stateCode}" does not match FIPS ${stateFips}`);
    }
    if (hospital.state.trim().toUpperCase() !== stateCode) {
      problems.push(
        `CMS state ${hospital.state} does not match Census state ${stateCode}`,
      );
    }
    if (!censusCounty.name.trim()) {
      problems.push("Census county name is blank");
    }
  }
  if (COUNTY_FIPS.test(countyFips) && !areaByCounty.has(countyFips)) {
    problems.push(
      `county FIPS ${countyFips} has no single OEWS area in ${OEWS_AREA_COUNTY_DATASET}`,
    );
  }
  if (problems.length > 0) {
    pushError(
      validationErrors,
      `Hospital ${hospital.ccn}: ${problems.join("; ")}`,
    );
    return null;
  }

  return {
    hospitalCcn: hospital.ccn,
    countyFips,
    countyName: censusCounty!.name,
    stateFips,
    stateCode,
    source: HOSPITAL_COUNTY_SOURCE,
    sourceDataset: HOSPITAL_COUNTY_DATASET,
    resolutionMethod: match.method,
  };
}

function verifyHospital(
  expected: (typeof VERIFICATION_HOSPITALS)[number],
  hospitalsByCcn: Map<string, HospitalGeoInput>,
  resolutionByCcn: Map<string, HospitalCountyPlanRow>,
  areaByCounty: Map<string, OewsAreaCountyPlanRow>,
  unresolved: UnresolvedHospital[],
): VerificationResult {
  const hospital = hospitalsByCcn.get(expected.ccn);
  const resolution = resolutionByCcn.get(expected.ccn);
  const area = resolution ? areaByCounty.get(resolution.countyFips) : undefined;
  const unresolvedRow = unresolved.find((row) => row.ccn === expected.ccn);
  const base = {
    ccn: expected.ccn,
    label: expected.label,
    countyHint: expected.countyHint,
    expectedAreaCode: expected.expectedAreaCode,
    present: Boolean(hospital),
    countyFips: resolution?.countyFips ?? null,
    countyName: resolution?.countyName ?? null,
    stateCode: resolution?.stateCode ?? null,
    geographicAreaCode: area?.geographicAreaCode ?? null,
    geographicAreaName: area?.geographicAreaName ?? null,
    geographicLevel: area?.geographicLevel ?? null,
    resolutionMethod: resolution?.resolutionMethod ?? null,
  };

  if (!hospital) {
    return {
      ...base,
      ok: false,
      detail: "not in the hospital extract",
    };
  }
  if (!resolution) {
    return {
      ...base,
      ok: false,
      detail: unresolvedRow
        ? `unresolved: ${unresolvedRow.reason}`
        : "not in the hospital county plan",
    };
  }
  if (!area || area.geographicAreaCode !== expected.expectedAreaCode) {
    return {
      ...base,
      ok: false,
      detail: `area ${area?.geographicAreaCode ?? "missing"}, expected ${expected.expectedAreaCode}`,
    };
  }
  if (
    !resolution.countyName.toLowerCase().includes(expected.countyHint.toLowerCase())
  ) {
    return {
      ...base,
      ok: false,
      detail: `county "${resolution.countyName}" does not contain ${expected.countyHint}`,
    };
  }
  return {
    ...base,
    ok: true,
    detail: `${resolution.countyFips} ${resolution.countyName} → ${area.geographicAreaCode} ${area.geographicAreaName}`,
  };
}
