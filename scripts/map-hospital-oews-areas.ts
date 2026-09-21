/**
 * Read-only hospital → OEWS area prototype.
 *
 * Resolves CMS hospital state + county (Connecticut town, when the CMS
 * county is still a retired county) to a Census county FIPS, then to the
 * BLS May 2025 metropolitan or nonmetropolitan area. Prints a report.
 * Does not write Hospital, LocalPayBenchmark, or any other table.
 *
 *   npx tsx scripts/map-hospital-oews-areas.ts
 *   npx tsx scripts/map-hospital-oews-areas.ts --hospitals data/fixtures/oews-may-2025/example-hospitals.json
 */

import fs from "node:fs";
import path from "node:path";
import { readFirstSheetRows } from "./oews/area-mapping/read-sheet";
import { resolveHospitals } from "./oews/area-mapping/resolve";
import { normalizeGeographyName } from "./oews/area-mapping/names";
import {
  assignmentsFromBlsDefinitions,
  parseBlsAreaDefinitions,
  parseCensusGeocodes,
  parseOeArea,
  parseOmbCounties,
} from "./oews/area-mapping/sources";
import type {
  HospitalAreaMatch,
  HospitalGeoInput,
  OewsAssignment,
} from "./oews/area-mapping/types";
import { indexZctaCounties, summarizeZipCheck } from "./oews/area-mapping/zip-check";
import type { OmbCounty } from "./oews/area-mapping/sources";

const DEFINITIONS_URL = "https://www.bls.gov/oes/area_definitions_m2025.xlsx";
const OE_AREA_URL = "https://download.bls.gov/pub/time.series/oe/oe.area";
const GEOCODES_URL =
  "https://www2.census.gov/programs-surveys/popest/geographies/2024/all-geocodes-v2024.xlsx";
const OMB_URL =
  "https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx";
const ZCTA_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt";
const CMS_URL =
  "https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0";

const FIXTURE_DIR = path.resolve("data/fixtures/oews-may-2025");
const CACHE_DIR = path.resolve("data/generated/oews-area-mapping");

const FEATURED = [
  { code: "14740", label: "Bremerton-Silverdale-Port Orchard, WA" },
  { code: "31540", label: "Madison, WI" },
  { code: "39580", label: "Raleigh-Cary, NC" },
  { code: "42660", label: "Seattle-Tacoma-Bellevue, WA" },
];

function argValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return null;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function textOf(bytes: Uint8Array) {
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

async function fetchBytes(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "HospitalCompareOewsAreaPrototype/1.0",
      Accept: "*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function cachedFile(
  url: string,
  dest: string,
  refresh: boolean,
  valid: (bytes: Uint8Array) => boolean,
) {
  if (!refresh && fs.existsSync(dest)) {
    const existing = new Uint8Array(fs.readFileSync(dest));
    if (valid(existing)) {
      return { bytes: existing, source: dest };
    }
  }
  const bytes = await fetchBytes(url);
  if (!valid(bytes)) {
    throw new Error(`Download from ${url} was not a usable file`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, bytes);
  return { bytes, source: url };
}

function isXlsx(bytes: Uint8Array) {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isOeArea(bytes: Uint8Array) {
  return textOf(bytes).startsWith("state_code");
}

function isZcta(bytes: Uint8Array) {
  return textOf(bytes).includes("GEOID_ZCTA5_20");
}

async function loadTextSource(
  url: string,
  cachePath: string,
  fixturePath: string,
  refresh: boolean,
  valid: (bytes: Uint8Array) => boolean,
  label: string,
) {
  try {
    const downloaded = await cachedFile(url, cachePath, refresh, valid);
    return { text: textOf(downloaded.bytes), source: downloaded.source };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`${label} download unavailable (${message}).`);
    console.log(`Using snapshot ${fixturePath}`);
    return { text: fs.readFileSync(fixturePath, "utf8"), source: fixturePath };
  }
}

function stringField(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function readHospitals(filePath: string): HospitalGeoInput[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`${filePath} must be a JSON array of hospitals`);
  }
  return parsed.map((row, index) => {
    if (!row || typeof row !== "object") {
      throw new Error(`${filePath} row ${index} is not an object`);
    }
    const record = row as Record<string, unknown>;
    const ccn = stringField(record, ["ccn", "facility_id", "Facility ID"]).toUpperCase();
    const name = stringField(record, ["name", "facility_name", "Facility Name"]);
    const state = stringField(record, ["state", "State"]).toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(ccn)) {
      throw new Error(`${filePath} row ${index} has an invalid CCN`);
    }
    if (!name || !/^[A-Z]{2}$/.test(state)) {
      throw new Error(`${filePath} row ${index} is missing a name or state`);
    }
    return {
      ccn,
      name,
      city: stringField(record, ["city", "citytown", "City/Town"]),
      state,
      zip: stringField(record, ["zip", "zip_code", "ZIP Code"]),
      county: stringField(record, ["county", "countyparish", "County/Parish"]) || null,
    };
  });
}

async function downloadCmsHospitals() {
  const hospitals: HospitalGeoInput[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (hospitals.length < total) {
    const response = await fetch(CMS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "HospitalCompareOewsAreaPrototype/1.0",
      },
      body: JSON.stringify({
        limit: 1000,
        offset,
        count: true,
        results: true,
        schema: false,
        properties: [
          "facility_id",
          "facility_name",
          "address",
          "citytown",
          "state",
          "zip_code",
          "countyparish",
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`CMS hospital API returned HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
      count?: number;
      results?: Record<string, unknown>[];
    };
    const rows = body.results ?? [];
    total = body.count ?? rows.length;
    if (rows.length === 0) {
      break;
    }
    const file = path.join(CACHE_DIR, `cms-page-${offset}.json`);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(rows));
    hospitals.push(...readHospitals(file));
    offset += rows.length;
  }
  const dest = path.join(CACHE_DIR, "cms-hospitals.json");
  fs.writeFileSync(dest, JSON.stringify(hospitals, null, 2));
  return { hospitals, source: `${CMS_URL} (${dest})` };
}

function countBy(matches: HospitalAreaMatch[], field: "method" | "geographicLevel") {
  const counts = new Map<string, number>();
  for (const match of matches) {
    const key = match[field] ?? "(none)";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function compareOmb(
  ombCounties: OmbCounty[],
  byCountyFips: Map<string, OewsAssignment>,
) {
  let metropolitanChecked = 0;
  let metropolitanAgree = 0;
  const metropolitanMismatches: string[] = [];
  let micropolitanInNonmetro = 0;
  let micropolitanInMetro = 0;
  let micropolitanMissing = 0;

  for (const row of ombCounties) {
    const assignment = byCountyFips.get(row.countyFips);
    if (row.statisticalArea === "Metropolitan Statistical Area") {
      metropolitanChecked += 1;
      if (!assignment || assignment.cbsaCode !== row.cbsaCode) {
        metropolitanMismatches.push(
          `${row.countyFips} OMB ${row.cbsaCode} ${row.cbsaTitle}; OEWS ${assignment?.geographicAreaCode ?? "missing"} ${assignment?.geographicAreaName ?? ""}`.trim(),
        );
      } else {
        metropolitanAgree += 1;
      }
    } else if (row.statisticalArea === "Micropolitan Statistical Area") {
      if (!assignment) {
        micropolitanMissing += 1;
      } else if (assignment.geographicLevel === "Nonmetropolitan Area") {
        micropolitanInNonmetro += 1;
      } else {
        micropolitanInMetro += 1;
      }
    }
  }

  return {
    metropolitanChecked,
    metropolitanAgree,
    metropolitanMismatches,
    micropolitanInNonmetro,
    micropolitanInMetro,
    micropolitanMissing,
  };
}

function printFeatured(
  hospitals: HospitalGeoInput[],
  matches: HospitalAreaMatch[],
) {
  const hospitalByCcn = new Map(hospitals.map((hospital) => [hospital.ccn, hospital]));
  console.log("");
  console.log("Featured markets");
  for (const featured of FEATURED) {
    const rows = matches.filter(
      (match) => match.geographicAreaCode === featured.code,
    );
    console.log("");
    console.log(`${featured.label} (${featured.code}): ${rows.length} hospitals`);
    for (const match of rows.slice(0, 8)) {
      const hospital = hospitalByCcn.get(match.ccn);
      console.log(
        `  ${match.ccn} ${hospital?.name ?? ""} | ${hospital?.city ?? ""}, ${hospital?.state ?? ""} ${hospital?.zip ?? ""} | ${hospital?.county ?? ""} | ${match.countyFips} ${match.countyName} | ${match.method}`,
      );
    }
    if (rows.length > 8) {
      console.log(`  … ${rows.length - 8} more`);
    }
  }
}

async function main() {
  const refresh = process.argv.includes("--refresh");
  const hospitalsArg = argValue("--hospitals");
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const definitionsFile = await cachedFile(
    DEFINITIONS_URL,
    path.join(CACHE_DIR, "area_definitions_m2025.xlsx"),
    refresh,
    isXlsx,
  ).catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const fixture = path.join(FIXTURE_DIR, "area_definitions_m2025.xlsx");
    console.log(`BLS area definitions download unavailable (${message}).`);
    console.log(`Using snapshot ${fixture}`);
    return {
      bytes: new Uint8Array(fs.readFileSync(fixture)),
      source: fixture,
    };
  });
  const oeAreaFile = await loadTextSource(
    OE_AREA_URL,
    path.join(CACHE_DIR, "oe.area"),
    path.join(FIXTURE_DIR, "oe.area"),
    refresh,
    isOeArea,
    "BLS oe.area",
  );
  const definitionsSource = definitionsFile.source;
  const oeAreaSource = oeAreaFile.source;
  const oeAreaText = oeAreaFile.text;

  const geocodes = await cachedFile(
    GEOCODES_URL,
    path.join(CACHE_DIR, "all-geocodes-v2024.xlsx"),
    refresh,
    isXlsx,
  );
  const omb = await cachedFile(
    OMB_URL,
    path.join(CACHE_DIR, "list1_2023.xlsx"),
    refresh,
    isXlsx,
  );
  const zcta = await cachedFile(
    ZCTA_URL,
    path.join(CACHE_DIR, "tab20_zcta520_county20_natl.txt"),
    refresh,
    isZcta,
  );

  const definitions = parseBlsAreaDefinitions(
    readFirstSheetRows(definitionsFile.bytes, "BLS area definitions"),
  );
  const oeArea = parseOeArea(oeAreaText);
  const census = parseCensusGeocodes(
    readFirstSheetRows(geocodes.bytes, "Census geocodes"),
  );
  const ombCounties = parseOmbCounties(readFirstSheetRows(omb.bytes, "OMB list 1"));
  const byCountyFips = assignmentsFromBlsDefinitions(definitions);
  const crosswalk = { byCountyFips, unlinked: [] };

  const censusByFips = new Map(
    census.counties.map((county) => [
      `${county.stateFips}${county.countyFips3}`,
      county,
    ]),
  );
  const nameMismatches: string[] = [];
  for (const definition of definitions) {
    const censusCounty = censusByFips.get(definition.countyFips);
    if (!censusCounty) {
      nameMismatches.push(
        `${definition.countyFips} ${definition.countyName} is not in the Census geocode file`,
      );
      continue;
    }
    if (
      normalizeGeographyName(censusCounty.name) !==
      normalizeGeographyName(definition.countyName)
    ) {
      nameMismatches.push(
        `${definition.countyFips} BLS "${definition.countyName}" vs Census "${censusCounty.name}"`,
      );
    }
  }
  const censusMissing = census.counties.filter(
    (county) => !byCountyFips.has(`${county.stateFips}${county.countyFips3}`),
  );
  const oeMismatches: string[] = [];
  const xlsxAreas = new Map<string, string>();
  for (const definition of definitions) {
    xlsxAreas.set(definition.geographicAreaCode, definition.geographicAreaName);
  }
  for (const [code, name] of xlsxAreas) {
    const market = oeArea.markets.find((row) => row.geographicAreaCode === code);
    if (!market) {
      oeMismatches.push(`${code} ${name} is missing from oe.area`);
    } else if (
      normalizeGeographyName(market.areaName) !== normalizeGeographyName(name)
    ) {
      oeMismatches.push(
        `${code} workbook "${name}" vs oe.area "${market.areaName}"`,
      );
    }
  }
  if (
    nameMismatches.length > 0 ||
    censusMissing.length > 0 ||
    oeMismatches.length > 0
  ) {
    console.error(
      `Crosswalk check failed: ${nameMismatches.length} Census name mismatches, ${censusMissing.length} Census counties missing, ${oeMismatches.length} oe.area mismatches.`,
    );
    for (const line of [...nameMismatches, ...oeMismatches].slice(0, 20)) {
      console.error(`  ${line}`);
    }
    for (const county of censusMissing.slice(0, 10)) {
      console.error(
        `  census ${county.stateAbbrev} ${county.stateFips}${county.countyFips3} ${county.name}`,
      );
    }
    process.exitCode = 1;
  }

  const hospitalsFile = hospitalsArg
    ? { hospitals: readHospitals(hospitalsArg), source: hospitalsArg }
    : await downloadCmsHospitals();
  const matches = resolveHospitals(
    hospitalsFile.hospitals,
    crosswalk,
    census.ctTowns,
    census.counties,
  );
  const ombComparison = compareOmb(ombCounties, crosswalk.byCountyFips);
  const zipSummary = summarizeZipCheck({
    hospitals: hospitalsFile.hospitals,
    matches,
    zcta: indexZctaCounties(textOf(zcta.bytes)),
    areaCodeByCountyFips: new Map(
      [...crosswalk.byCountyFips.entries()].map(([fips, assignment]) => [
        fips,
        assignment.geographicAreaCode,
      ]),
    ),
  });

  const mapped = matches.filter((match) => match.status === "mapped");
  const unmapped = matches.filter((match) => match.status === "unmapped");
  const metro = mapped.filter(
    (match) => match.geographicLevel === "Metropolitan Statistical Area",
  );
  const nonmetro = mapped.filter(
    (match) => match.geographicLevel === "Nonmetropolitan Area",
  );

  console.log("");
  console.log("Hospital → OEWS area prototype (read-only)");
  console.log(`Definitions: ${definitionsSource}`);
  console.log(`oe.area:     ${oeAreaSource}`);
  console.log(`Census:      ${geocodes.source}`);
  console.log(`OMB:         ${omb.source}`);
  console.log(`ZCTA:        ${zcta.source}`);
  console.log(`Hospitals:   ${hospitalsFile.source}`);
  console.log("");
  console.log(`Definition county rows: ${definitions.length}`);
  console.log(`OEWS market areas:      ${xlsxAreas.size}`);
  console.log(`oe.area markets:        ${oeArea.markets.length}`);
  console.log(`Census counties:        ${census.counties.length}`);
  console.log(`Connecticut towns:      ${census.ctTowns.length}`);
  console.log(`Crosswalk counties:     ${byCountyFips.size}`);
  console.log(`Census name mismatches: ${nameMismatches.length}`);
  console.log(`oe.area mismatches:     ${oeMismatches.length}`);
  console.log(`Census counties missing from OEWS: ${censusMissing.length}`);
  console.log("");
  console.log(
    `OMB metropolitan counties: ${ombComparison.metropolitanAgree}/${ombComparison.metropolitanChecked} CBSA codes agree`,
  );
  console.log(
    `OMB micropolitan counties placed in OEWS nonmetro: ${ombComparison.micropolitanInNonmetro}; placed in OEWS metro: ${ombComparison.micropolitanInMetro}; missing: ${ombComparison.micropolitanMissing}`,
  );
  for (const line of ombComparison.metropolitanMismatches.slice(0, 15)) {
    console.log(`  OMB mismatch ${line}`);
  }
  console.log("");
  console.log(`Hospitals: ${matches.length}`);
  console.log(
    `Mapped:    ${mapped.length} (${((mapped.length / matches.length) * 100).toFixed(2)}%)`,
  );
  console.log(`Unmapped:  ${unmapped.length}`);
  console.log(`Metro:     ${metro.length}`);
  console.log(`Nonmetro:  ${nonmetro.length}`);
  console.log("");
  console.log("Resolution methods");
  for (const [method, count] of countBy(matches, "method")) {
    console.log(`  ${count.toString().padStart(5)}  ${method}`);
  }
  console.log("");
  console.log("Unmapped hospitals");
  const hospitalByCcn = new Map(
    hospitalsFile.hospitals.map((hospital) => [hospital.ccn, hospital]),
  );
  for (const match of unmapped) {
    const hospital = hospitalByCcn.get(match.ccn);
    console.log(
      `  ${match.ccn} ${hospital?.name ?? ""} | ${hospital?.city ?? ""}, ${hospital?.state ?? ""} | county ${hospital?.county ?? ""} | ${match.method}`,
    );
  }
  printFeatured(hospitalsFile.hospitals, matches);
  const nonmetroExample = nonmetro[0];
  if (nonmetroExample) {
    const hospital = hospitalByCcn.get(nonmetroExample.ccn);
    console.log("");
    console.log(
      `Nonmetro example: ${nonmetroExample.ccn} ${hospital?.name ?? ""} | ${hospital?.county ?? ""}, ${hospital?.state ?? ""} → ${nonmetroExample.geographicAreaCode} ${nonmetroExample.geographicAreaName}`,
    );
  }
  console.log("");
  console.log("ZIP / ZCTA check (Census 2020 ZCTA, not HUD USPS ZIP)");
  for (const [key, value] of Object.entries(zipSummary)) {
    console.log(`  ${key}: ${value}`);
  }

  const report = {
    hospitals: matches.length,
    mapped: mapped.length,
    unmapped: unmapped.length,
    metro: metro.length,
    nonmetro: nonmetro.length,
    methods: Object.fromEntries(countBy(matches, "method")),
    unmappedHospitals: unmapped.map((match) => ({
      ...match,
      name: hospitalByCcn.get(match.ccn)?.name ?? "",
      city: hospitalByCcn.get(match.ccn)?.city ?? "",
      state: hospitalByCcn.get(match.ccn)?.state ?? "",
      county: hospitalByCcn.get(match.ccn)?.county ?? "",
    })),
    featured: FEATURED.map((featured) => ({
      ...featured,
      hospitals: matches.filter((match) => match.geographicAreaCode === featured.code)
        .length,
    })),
    omb: {
      ...ombComparison,
      metropolitanMismatches: ombComparison.metropolitanMismatches.slice(0, 50),
    },
    zip: zipSummary,
    crosswalkCounties: crosswalk.byCountyFips.size,
    sources: {
      definitions: definitionsSource,
      oeArea: oeAreaSource,
      census: geocodes.source,
      omb: omb.source,
      zcta: zcta.source,
      hospitals: hospitalsFile.source,
    },
  };
  const reportPath = path.join(CACHE_DIR, "report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log("");
  console.log(`Wrote ${reportPath}`);
  console.log("No database tables were written.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
