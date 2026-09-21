import {
  CMS_COUNTY_ALIASES,
  NON_CITY_SUFFIXES,
  OUTSIDE_OEWS_AREA_STATES,
  RETIRED_CMS_COUNTIES,
  compactGeographyName,
  expandCompassTokens,
  normalizeGeographyName,
  splitCountySuffix,
  townMatchKey,
} from "./names";
import type {
  CensusCounty,
  CtTown,
  DefinitionCounty,
  HospitalAreaMatch,
  HospitalGeoInput,
  OeMarketArea,
  OewsAssignment,
} from "./types";

export type OewsCrosswalk = {
  byCountyFips: Map<string, OewsAssignment>;
  /** Definition counties whose names were not in the supplied Census list. */
  unlinked: DefinitionCounty[];
};

type IndexedCounty = CensusCounty & {
  fips: string;
  full: string;
  base: string;
  suffix: string | null;
  compactFull: string;
  compactBase: string;
};

function indexCounties(counties: CensusCounty[]) {
  const byState = new Map<string, IndexedCounty[]>();
  const byStateAndFullName = new Map<string, IndexedCounty[]>();
  for (const county of counties) {
    const full = normalizeGeographyName(county.name);
    const split = splitCountySuffix(full);
    const indexed: IndexedCounty = {
      ...county,
      fips: `${county.stateFips}${county.countyFips3}`,
      full,
      base: split.base,
      suffix: split.suffix,
      compactFull: compactGeographyName(county.name),
      compactBase: split.base.replaceAll(" ", ""),
    };
    const stateRows = byState.get(county.stateAbbrev) ?? [];
    stateRows.push(indexed);
    byState.set(county.stateAbbrev, stateRows);
    const nameKey = `${county.stateAbbrev}|${full}`;
    const nameRows = byStateAndFullName.get(nameKey) ?? [];
    nameRows.push(indexed);
    byStateAndFullName.set(nameKey, nameRows);
  }
  return { byState, byStateAndFullName };
}

function uniqueCounty(rows: IndexedCounty[]): IndexedCounty | null {
  const fips = new Set(rows.map((row) => row.fips));
  return fips.size === 1 ? rows[0] : null;
}

export type CountyNameMatch = {
  county: IndexedCounty;
  method:
    | "census_name"
    | "census_suffix"
    | "compact_spelling"
    | "county_rather_than_independent_city";
};

/**
 * Match one CMS county string to a Census county equivalent in the same state.
 * Returns null when the name is missing, ambiguous, or not in the Census list.
 */
export function matchCensusCounty(
  stateAbbrev: string,
  countyName: string,
  byState: Map<string, IndexedCounty[]>,
): CountyNameMatch | null {
  const normalized = normalizeGeographyName(countyName);
  if (!normalized) {
    return null;
  }
  const rows = byState.get(stateAbbrev) ?? [];
  const exact = rows.filter((row) => row.full === normalized);
  const exactCounty = uniqueCounty(exact);
  if (exactCounty) {
    return { county: exactCounty, method: "census_name" };
  }
  if (exact.length > 1) {
    return null;
  }

  // CMS usually omits the Census suffix: "KITSAP" → "Kitsap County",
  // "JAMES CITY" → "James City County". Do not strip CITY from the CMS
  // value first, or "James City" collapses to "James".
  const droppedSuffix = rows.filter((row) => row.base === normalized);
  const droppedCounty = uniqueCounty(droppedSuffix);
  if (droppedCounty) {
    return { county: droppedCounty, method: "census_suffix" };
  }

  const cmsSplit = splitCountySuffix(normalized);
  if (cmsSplit.base !== normalized) {
    const stripped = rows.filter(
      (row) => row.base === cmsSplit.base || row.full === cmsSplit.base,
    );
    const strippedCounty = uniqueCounty(stripped);
    if (strippedCounty) {
      return { county: strippedCounty, method: "census_suffix" };
    }
  }

  const compact = compactGeographyName(countyName);
  const compactBase = cmsSplit.base.replaceAll(" ", "");
  const compactHits = rows.filter(
    (row) =>
      row.compactFull === compact ||
      row.compactBase === compact ||
      row.compactFull === compactBase ||
      row.compactBase === compactBase,
  );
  const compactCounty = uniqueCounty(compactHits);
  if (compactCounty) {
    return { county: compactCounty, method: "compact_spelling" };
  }

  if (droppedSuffix.length > 1 && !normalized.endsWith(" CITY")) {
    const nonCity = droppedSuffix.filter(
      (row) => row.suffix !== null && NON_CITY_SUFFIXES.has(row.suffix),
    );
    const preferred = uniqueCounty(nonCity);
    if (preferred) {
      return {
        county: preferred,
        method: "county_rather_than_independent_city",
      };
    }
  }
  return null;
}

export function buildOewsCrosswalk(input: {
  definitions: DefinitionCounty[];
  marketsByName: Map<string, OeMarketArea>;
  counties: CensusCounty[];
}): OewsCrosswalk {
  const { byStateAndFullName } = indexCounties(input.counties);
  const byCountyFips = new Map<string, OewsAssignment>();
  const unlinked: DefinitionCounty[] = [];

  for (const definition of input.definitions) {
    const nameKey = `${definition.stateAbbrev}|${normalizeGeographyName(definition.countyName)}`;
    const hits = byStateAndFullName.get(nameKey) ?? [];
    if (hits.length === 0) {
      unlinked.push(definition);
      continue;
    }
    if (new Set(hits.map((hit) => hit.fips)).size !== 1) {
      throw new Error(`Census county name is not unique: ${nameKey}`);
    }
    const market = input.marketsByName.get(
      normalizeGeographyName(definition.areaName),
    );
    if (!market) {
      throw new Error(
        `BLS area definitions name "${definition.areaName}" is not in oe.area`,
      );
    }
    if (market.geographicLevel !== definition.geographicLevel) {
      throw new Error(
        `Area level mismatch for "${definition.areaName}": ${definition.geographicLevel} vs ${market.geographicLevel}`,
      );
    }
    const county = hits[0];
    const existing = byCountyFips.get(county.fips);
    if (
      existing &&
      existing.geographicAreaCode !== market.geographicAreaCode
    ) {
      throw new Error(
        `County ${county.fips} is in both ${existing.geographicAreaCode} and ${market.geographicAreaCode}`,
      );
    }
    if (!existing) {
      byCountyFips.set(county.fips, {
        countyFips: county.fips,
        countyName: county.name,
        stateAbbrev: county.stateAbbrev,
        geographicAreaCode: market.geographicAreaCode,
        geographicAreaName: market.areaName,
        geographicLevel: market.geographicLevel,
        cbsaCode: market.cbsaCode,
      });
    }
  }

  return { byCountyFips, unlinked };
}

function unmatched(
  hospital: HospitalGeoInput,
  method: string,
): HospitalAreaMatch {
  return {
    ccn: hospital.ccn,
    status: "unmapped",
    method,
    countyFips: null,
    countyName: null,
    geographicAreaCode: null,
    geographicAreaName: null,
    geographicLevel: null,
    cbsaCode: null,
  };
}

function fromAssignment(
  hospital: HospitalGeoInput,
  assignment: OewsAssignment,
  method: string,
): HospitalAreaMatch {
  return {
    ccn: hospital.ccn,
    status: "mapped",
    method,
    countyFips: assignment.countyFips,
    countyName: assignment.countyName,
    geographicAreaCode: assignment.geographicAreaCode,
    geographicAreaName: assignment.geographicAreaName,
    geographicLevel: assignment.geographicLevel,
    cbsaCode: assignment.cbsaCode,
  };
}

function matchCtTown(
  city: string,
  towns: CtTown[],
): { countyFips: string } | null {
  const key = townMatchKey(city);
  if (!key) {
    return null;
  }
  const hits = towns.filter((town) => townMatchKey(town.name) === key);
  const fips = new Set(hits.map((town) => town.countyFips));
  return fips.size === 1 ? { countyFips: hits[0].countyFips } : null;
}

export function resolveHospital(
  hospital: HospitalGeoInput,
  crosswalk: OewsCrosswalk,
  ctTowns: CtTown[],
  counties: CensusCounty[],
): HospitalAreaMatch {
  return resolveHospitalWithIndex(
    hospital,
    crosswalk,
    ctTowns,
    indexCounties(counties).byState,
  );
}

function resolveHospitalWithIndex(
  hospital: HospitalGeoInput,
  crosswalk: OewsCrosswalk,
  ctTowns: CtTown[],
  byState: Map<string, IndexedCounty[]>,
): HospitalAreaMatch {
  const state = hospital.state.trim().toUpperCase();
  if (OUTSIDE_OEWS_AREA_STATES.has(state)) {
    return unmatched(hospital, "outside_oews_metro_nonmetro_coverage");
  }

  const countyName = hospital.county?.trim() ?? "";
  const normalizedCounty = normalizeGeographyName(countyName);
  if (!normalizedCounty) {
    return unmatched(hospital, "missing_county");
  }
  if (RETIRED_CMS_COUNTIES.has(`${state}|${normalizedCounty}`)) {
    return unmatched(hospital, "retired_census_area");
  }

  const alias = CMS_COUNTY_ALIASES[`${state}|${normalizedCounty}`];
  let nameMatch = matchCensusCounty(state, alias ?? countyName, byState);
  let method: string | undefined = alias
    ? "cms_published_alias"
    : nameMatch?.method;

  if (!nameMatch) {
    const expanded = expandCompassTokens(normalizedCounty);
    if (expanded) {
      nameMatch = matchCensusCounty(state, expanded, byState);
      if (nameMatch) {
        method = "cms_compass_abbreviation";
      }
    }
  }

  if (!nameMatch && state === "CT") {
    const town = matchCtTown(hospital.city, ctTowns);
    if (!town) {
      return unmatched(hospital, "ct_town_unmatched");
    }
    const assignment = crosswalk.byCountyFips.get(town.countyFips);
    if (!assignment) {
      return unmatched(hospital, "county_not_in_oews_definitions");
    }
    return fromAssignment(hospital, assignment, "ct_town_subdivision");
  }

  if (!nameMatch || !method) {
    return unmatched(hospital, "county_name_unmatched");
  }

  const assignment = crosswalk.byCountyFips.get(nameMatch.county.fips);
  if (!assignment) {
    return unmatched(hospital, "county_not_in_oews_definitions");
  }
  return fromAssignment(hospital, assignment, method);
}

export function resolveHospitals(
  hospitals: HospitalGeoInput[],
  crosswalk: OewsCrosswalk,
  ctTowns: CtTown[],
  counties: CensusCounty[],
): HospitalAreaMatch[] {
  const { byState } = indexCounties(counties);
  return hospitals.map((hospital) =>
    resolveHospitalWithIndex(hospital, crosswalk, ctTowns, byState),
  );
}
