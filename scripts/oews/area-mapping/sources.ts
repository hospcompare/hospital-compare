import {
  STATE_FIPS_TO_ABBREV,
  STATE_NAME_TO_ABBREV,
  normalizeGeographyName,
  padFipsPart,
} from "./names";

const KNOWN_STATE_ABBREVS = new Set(Object.values(STATE_NAME_TO_ABBREV));
import type {
  CensusCounty,
  CtTown,
  DefinitionCounty,
  GeographicLevel,
  OeMarketArea,
  OewsAssignment,
  SheetRow,
} from "./types";

function decodeHtml(text: string) {
  return text
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

function htmlDefinitionsToText(html: string) {
  const withMarkers = html
    .replace(/<h2\b[^>]*>/gi, "\n## ")
    .replace(/<h3\b[^>]*>/gi, "\n### ")
    .replace(/<li\b[^>]*>/gi, "\n- ");
  return decodeHtml(withMarkers.replace(/<[^>]+>/g, ""));
}

function geographicLevel(areaName: string): GeographicLevel {
  return areaName.toLowerCase().includes("nonmetropolitan area")
    ? "Nonmetropolitan Area"
    : "Metropolitan Statistical Area";
}

/**
 * Parse the BLS definitions HTML page. The page's county lists omit some
 * counties that are present in area_definitions_m2025.xlsx (for example
 * Lake County, Indiana). The workbook is the source the prototype uses.
 */
export function parseAreaDefinitions(text: string): DefinitionCounty[] {
  const source = /<h2\b/i.test(text) ? htmlDefinitionsToText(text) : text;
  const counties: DefinitionCounty[] = [];
  let stateAbbrev: string | null = null;
  let areaName: string | null = null;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("## ")) {
      const heading = line.slice(3).trim();
      stateAbbrev = STATE_NAME_TO_ABBREV[heading] ?? null;
      areaName = null;
      continue;
    }
    if (line.startsWith("### ")) {
      if (!stateAbbrev) {
        throw new Error(`Area heading outside a state section: ${line}`);
      }
      areaName = line.slice(4).trim();
      continue;
    }
    if (!line.startsWith("- ") || !stateAbbrev || !areaName) {
      continue;
    }
    const label = line.slice(2).trim();
    const stateSuffix = /^(.*),\s*([A-Z]{2})$/.exec(label);
    const countyName = stateSuffix ? stateSuffix[1].trim() : label;
    const countyState = stateSuffix ? stateSuffix[2] : stateAbbrev;
    if (!KNOWN_STATE_ABBREVS.has(countyState)) {
      throw new Error(`Unknown state abbreviation on county "${label}"`);
    }
    counties.push({
      stateAbbrev: countyState,
      countyName,
      areaName,
      geographicLevel: geographicLevel(areaName),
    });
  }

  if (counties.length === 0) {
    throw new Error("Area definitions did not contain any counties");
  }
  return counties;
}

export function benchmarkAreaCode(
  areaCode: string,
  level: GeographicLevel,
): { geographicAreaCode: string; cbsaCode: string | null } {
  if (!/^\d{7}$/.test(areaCode)) {
    throw new Error(`OEWS area code must be 7 digits, received "${areaCode}"`);
  }
  if (level === "Metropolitan Statistical Area") {
    if (!areaCode.startsWith("00")) {
      throw new Error(
        `Metropolitan oe.area code ${areaCode} does not start with 00`,
      );
    }
    const cbsaCode = areaCode.slice(2);
    return { geographicAreaCode: cbsaCode, cbsaCode };
  }
  if (areaCode.startsWith("00")) {
    throw new Error(
      `Nonmetropolitan oe.area code ${areaCode} uses the metropolitan 00 prefix`,
    );
  }
  return { geographicAreaCode: areaCode, cbsaCode: null };
}

export type ParsedOeArea = {
  markets: OeMarketArea[];
  byNormalizedName: Map<string, OeMarketArea>;
};

/** Parse download.bls.gov/pub/time.series/oe/oe.area. Tabs or single spaces. */
export function parseOeArea(text: string): ParsedOeArea {
  const markets: OeMarketArea[] = [];
  const byNormalizedName = new Map<string, OeMarketArea>();
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (index === 0 || line.trim() === "") {
      continue;
    }
    const match = /^(\d{2})[ \t]+(\d{7})[ \t]+([A-Z])[ \t]+(.*\S)\s*$/.exec(
      line,
    );
    if (!match) {
      throw new Error(`Unreadable oe.area line ${index + 1}: ${line}`);
    }
    const areaType = match[3];
    if (areaType !== "M") {
      continue;
    }
    const areaName = match[4];
    const level = geographicLevel(areaName);
    const codes = benchmarkAreaCode(match[2], level);
    const market: OeMarketArea = {
      areaCode: match[2],
      areaName,
      geographicLevel: level,
      geographicAreaCode: codes.geographicAreaCode,
      cbsaCode: codes.cbsaCode,
    };
    const key = normalizeGeographyName(areaName);
    const existing = byNormalizedName.get(key);
    if (existing && existing.geographicAreaCode !== market.geographicAreaCode) {
      throw new Error(`Duplicate OEWS area name "${areaName}"`);
    }
    if (!existing) {
      byNormalizedName.set(key, market);
      markets.push(market);
    }
  }
  if (markets.length === 0) {
    throw new Error("oe.area did not contain metropolitan or nonmetropolitan areas");
  }
  return { markets, byNormalizedName };
}

function recordsFromHeader(
  rows: SheetRow[],
  headerMarker: string,
): Record<string, string>[] {
  const header = rows.find((row) =>
    Object.values(row.cells).includes(headerMarker),
  );
  if (!header) {
    throw new Error(`Worksheet is missing a "${headerMarker}" header`);
  }
  const columns = new Map<string, string>();
  for (const [letter, name] of Object.entries(header.cells)) {
    if (name.trim()) {
      columns.set(letter, name.trim());
    }
  }
  const records: Record<string, string>[] = [];
  for (const row of rows) {
    if (row.excelRow <= header.excelRow) {
      continue;
    }
    const record: Record<string, string> = {};
    let hasValue = false;
    for (const [letter, name] of columns) {
      const value = row.cells[letter]?.trim() ?? "";
      if (value) {
        hasValue = true;
      }
      record[name] = value;
    }
    if (hasValue) {
      records.push(record);
    }
  }
  return records;
}

export type CensusGeography = {
  counties: CensusCounty[];
  ctTowns: CtTown[];
};

export type BlsAreaDefinition = {
  stateAbbrev: string;
  stateFips: string;
  countyFips3: string;
  countyFips: string;
  countyName: string;
  geographicAreaCode: string;
  geographicAreaName: string;
  geographicLevel: GeographicLevel;
  cbsaCode: string | null;
};

/**
 * Official May 2025 area-definition workbook. Area codes are already the
 * wage-workbook AREA values: 5-digit CBSA for metropolitan areas, 7-digit
 * BLS codes for nonmetropolitan areas.
 */
export function parseBlsAreaDefinitions(rows: SheetRow[]): BlsAreaDefinition[] {
  const records = recordsFromHeader(rows, "May 2025 Area Code");
  const definitions: BlsAreaDefinition[] = [];
  for (const record of records) {
    const stateFips = padFipsPart(record["FIPS Code"] ?? "", 2);
    const countyFips3 = padFipsPart(record["County Code"] ?? "", 3);
    const areaCode = (record["May 2025 Area Code"] ?? "").trim();
    const areaName = (record["May 2025 Area Title"] ?? "").trim();
    const countyName = (record["County Name"] ?? "").trim();
    const stateAbbrev = (record["State Abbreviation"] ?? "").trim();
    if (!/^(?:\d{5}|\d{7})$/.test(areaCode)) {
      throw new Error(
        `May 2025 area code "${areaCode}" for ${countyName} is not 5 or 7 digits`,
      );
    }
    const geographicLevel: GeographicLevel = areaName
      .toLowerCase()
      .includes("nonmetropolitan area")
      ? "Nonmetropolitan Area"
      : "Metropolitan Statistical Area";
    if (geographicLevel === "Metropolitan Statistical Area" && areaCode.length !== 5) {
      throw new Error(`${areaName} uses nonmetropolitan code ${areaCode}`);
    }
    if (geographicLevel === "Nonmetropolitan Area" && areaCode.length !== 7) {
      throw new Error(`${areaName} uses metropolitan code ${areaCode}`);
    }
    definitions.push({
      stateAbbrev,
      stateFips,
      countyFips3,
      countyFips: `${stateFips}${countyFips3}`,
      countyName,
      geographicAreaCode: areaCode,
      geographicAreaName: areaName,
      geographicLevel,
      cbsaCode: geographicLevel === "Metropolitan Statistical Area" ? areaCode : null,
    });
  }
  if (definitions.length === 0) {
    throw new Error("BLS area definition workbook did not contain counties");
  }
  return definitions;
}

export function assignmentsFromBlsDefinitions(
  definitions: BlsAreaDefinition[],
): Map<string, OewsAssignment> {
  const byCountyFips = new Map<string, OewsAssignment>();
  for (const definition of definitions) {
    const existing = byCountyFips.get(definition.countyFips);
    if (
      existing &&
      existing.geographicAreaCode !== definition.geographicAreaCode
    ) {
      throw new Error(
        `County ${definition.countyFips} is in both ${existing.geographicAreaCode} and ${definition.geographicAreaCode}`,
      );
    }
    if (!existing) {
      byCountyFips.set(definition.countyFips, {
        countyFips: definition.countyFips,
        countyName: definition.countyName,
        stateAbbrev: definition.stateAbbrev,
        geographicAreaCode: definition.geographicAreaCode,
        geographicAreaName: definition.geographicAreaName,
        geographicLevel: definition.geographicLevel,
        cbsaCode: definition.cbsaCode,
      });
    }
  }
  return byCountyFips;
}

/** Census Bureau all-geocodes vintage file (summary levels 050 and 061). */
export function parseCensusGeocodes(rows: SheetRow[]): CensusGeography {
  const records = recordsFromHeader(rows, "Summary Level");
  const counties: CensusCounty[] = [];
  const ctTowns: CtTown[] = [];
  for (const record of records) {
    const summary = record["Summary Level"];
    const stateFips = padFipsPart(record["State FIPS Code"] || "0", 2);
    const county3 = padFipsPart(record["County FIPS Code"] || "0", 3);
    const name = record["Area Name"] ?? "";
    const stateAbbrev = STATE_FIPS_TO_ABBREV[stateFips];
    if (summary === "050") {
      if (!stateAbbrev) {
        throw new Error(`County "${name}" has unknown state FIPS ${stateFips}`);
      }
      counties.push({
        stateAbbrev,
        stateFips,
        countyFips3: county3,
        name,
      });
    } else if (summary === "061" && stateFips === "09") {
      ctTowns.push({
        countyFips: `${stateFips}${county3}`,
        name,
      });
    }
  }
  if (counties.length === 0) {
    throw new Error("Census geocode file did not contain counties");
  }
  return { counties, ctTowns };
}

export type OmbCounty = {
  countyFips: string;
  cbsaCode: string;
  cbsaTitle: string;
  statisticalArea: string;
};

/** OMB Bulletin 23-01 list 1, county rows inside metropolitan and micropolitan areas. */
export function parseOmbCounties(rows: SheetRow[]): OmbCounty[] {
  const records = recordsFromHeader(rows, "CBSA Code");
  const counties: OmbCounty[] = [];
  for (const record of records) {
    const state = record["FIPS State Code"];
    const county = record["FIPS County Code"];
    const cbsaCode = record["CBSA Code"];
    if (!state || !county || !cbsaCode) {
      continue;
    }
    counties.push({
      countyFips: `${padFipsPart(state, 2)}${padFipsPart(county, 3)}`,
      cbsaCode: padFipsPart(cbsaCode, 5),
      cbsaTitle: record["CBSA Title"] ?? "",
      statisticalArea: record["Metropolitan/Micropolitan Statistical Area"] ?? "",
    });
  }
  if (counties.length === 0) {
    throw new Error("OMB delineation file did not contain counties");
  }
  return counties;
}
