/**
 * Populate HospitalCountyResolution and OewsAreaCounty.
 *
 * Dry-run is the default. Pass --write to upsert after the whole plan
 * validates. This script does not migrate, does not delete rows outside
 * the plan, and does not modify LocalPayBenchmark.
 *
 * Hospital county rows use the Census vintage (Census Bureau /
 * all-geocodes-v2024). OEWS county rows use the BLS May 2025 area
 * definitions (BLS OEWS / OEWS-2025-MAY). Unresolved hospitals are
 * reported and omitted.
 *
 *   npx tsx scripts/populate-oews-geography.ts
 *   npx tsx scripts/populate-oews-geography.ts --write
 *   npx tsx scripts/populate-oews-geography.ts --hospitals data/fixtures/oews-may-2025/example-hospitals.json
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { readFirstSheetRows } from "./oews/area-mapping/read-sheet";
import { resolveHospitals } from "./oews/area-mapping/resolve";
import {
  parseBlsAreaDefinitions,
  parseCensusGeocodes,
  parseOeArea,
} from "./oews/area-mapping/sources";
import type { HospitalGeoInput } from "./oews/area-mapping/types";
import {
  HOSPITAL_COUNTY_DATASET,
  HOSPITAL_COUNTY_SOURCE,
  OEWS_AREA_COUNTY_DATASET,
  OEWS_AREA_COUNTY_SOURCE,
  PROTOTYPE_HOSPITAL_RESOLUTIONS,
  PROTOTYPE_UNRESOLVED_HOSPITALS,
  buildGeographyPlan,
} from "./oews/geography/plan";
import type {
  GeographyPlan,
  HospitalCountyPlanRow,
  OewsAreaCountyPlanRow,
} from "./oews/geography/plan";

const DEFINITIONS_URL = "https://www.bls.gov/oes/area_definitions_m2025.xlsx";
const OE_AREA_URL = "https://download.bls.gov/pub/time.series/oe/oe.area";
const GEOCODES_URL =
  "https://www2.census.gov/programs-surveys/popest/geographies/2024/all-geocodes-v2024.xlsx";
const CMS_URL =
  "https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0";

const FIXTURE_DIR = path.resolve("data/fixtures/oews-may-2025");
const CACHE_DIR = path.resolve("data/generated/oews-area-mapping");
const SAMPLE_LIMIT = 20;
const WRITE_TIMEOUT_MS = 300_000;

const prismaHolder: { client: PrismaClient | null } = { client: null };

function printHelp() {
  console.log(
    [
      "Usage: npx tsx scripts/populate-oews-geography.ts [--write] [--refresh] [--hospitals <file.json>]",
      "",
      "Default mode is dry-run. --write upserts only when the whole plan validates.",
      "Hospital rows: Census Bureau / all-geocodes-v2024.",
      "OEWS rows: BLS OEWS / OEWS-2025-MAY.",
      "This script does not apply migrations and does not delete other rows.",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]) {
  let write = false;
  let refresh = false;
  let hospitalsPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--write") {
      write = true;
      continue;
    }
    if (arg === "--refresh") {
      refresh = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--hospitals") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--hospitals requires a JSON file path.");
      }
      hospitalsPath = path.resolve(process.cwd(), value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { write, refresh, hospitalsPath };
}

function textOf(bytes: Uint8Array) {
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
}

function isXlsx(bytes: Uint8Array) {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isOeArea(bytes: Uint8Array) {
  return textOf(bytes).startsWith("state_code");
}

async function fetchBytes(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "HospitalCompareOewsGeographyImport/1.0",
      Accept: "*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function readFixtureOrCache(
  fixturePath: string,
  cachePath: string,
  valid: (bytes: Uint8Array) => boolean,
) {
  if (fs.existsSync(fixturePath)) {
    const bytes = new Uint8Array(fs.readFileSync(fixturePath));
    if (valid(bytes)) {
      return { bytes, source: fixturePath };
    }
  }
  if (fs.existsSync(cachePath)) {
    const bytes = new Uint8Array(fs.readFileSync(cachePath));
    if (valid(bytes)) {
      return { bytes, source: cachePath };
    }
  }
  return null;
}

async function loadBytes(input: {
  label: string;
  url: string;
  fixturePath: string | null;
  cachePath: string;
  refresh: boolean;
  valid: (bytes: Uint8Array) => boolean;
}) {
  if (!input.refresh) {
    const existing = readFixtureOrCache(
      input.fixturePath ?? "",
      input.cachePath,
      input.valid,
    );
    if (existing) {
      return existing;
    }
  }

  try {
    const bytes = await fetchBytes(input.url);
    if (!input.valid(bytes)) {
      throw new Error(`Download from ${input.url} was not a usable file`);
    }
    fs.mkdirSync(path.dirname(input.cachePath), { recursive: true });
    fs.writeFileSync(input.cachePath, bytes);
    return { bytes, source: `${input.url} (${input.cachePath})` };
  } catch (error) {
    const fallback = readFixtureOrCache(
      input.fixturePath ?? "",
      input.cachePath,
      input.valid,
    );
    if (fallback) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`${input.label} download unavailable (${message}).`);
      console.log(`Using ${fallback.source}`);
      return fallback;
    }
    throw error;
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

function hospitalsFromJson(filePath: string): HospitalGeoInput[] {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
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

async function downloadCmsHospitals(refresh: boolean) {
  const dest = path.join(CACHE_DIR, "cms-hospitals.json");
  if (!refresh && fs.existsSync(dest)) {
    return { hospitals: hospitalsFromJson(dest), source: dest };
  }

  const hospitals: HospitalGeoInput[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  while (hospitals.length < total) {
    const response = await fetch(CMS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "HospitalCompareOewsGeographyImport/1.0",
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
    const pagePath = path.join(CACHE_DIR, `cms-page-${offset}.json`);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(pagePath, JSON.stringify(rows));
    hospitals.push(...hospitalsFromJson(pagePath));
    offset += rows.length;
  }
  if (hospitals.length === 0) {
    throw new Error("CMS hospital API returned no facilities");
  }
  fs.writeFileSync(dest, JSON.stringify(hospitals, null, 2));
  return { hospitals, source: `${CMS_URL} (${dest})` };
}

function connectPrisma() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  prismaHolder.client = prisma;
  return prisma;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isMissingRelation(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? String(error.code) : "";
  return code === "P2021" || /does not exist/i.test(errorText(error));
}

async function countExisting<T extends string>(
  load: () => Promise<T[]>,
  planned: ReadonlySet<T>,
) {
  try {
    const existing = await load();
    let wouldUpdate = 0;
    for (const key of existing) {
      if (planned.has(key)) {
        wouldUpdate += 1;
      }
    }
    return {
      available: true as const,
      wouldInsert: planned.size - wouldUpdate,
      wouldUpdate,
      outsidePlan: existing.length - wouldUpdate,
    };
  } catch (error) {
    if (isMissingRelation(error)) {
      return { available: false as const, reason: "table-missing" as const };
    }
    return {
      available: false as const,
      reason: "unavailable" as const,
      message: errorText(error),
    };
  }
}

async function missingHospitalCcns(
  prisma: PrismaClient,
  ccns: string[],
) {
  const found = new Set<string>();
  for (let index = 0; index < ccns.length; index += 1000) {
    const slice = ccns.slice(index, index + 1000);
    const rows = await prisma.hospital.findMany({
      where: { ccn: { in: slice } },
      select: { ccn: true },
    });
    for (const row of rows) {
      found.add(row.ccn);
    }
  }
  return ccns.filter((ccn) => !found.has(ccn));
}

async function benchmarkAreaGap(
  prisma: PrismaClient,
  plan: GeographyPlan,
) {
  try {
    const rows = await prisma.localPayBenchmark.findMany({
      where: {
        source: OEWS_AREA_COUNTY_SOURCE,
        sourceDataset: OEWS_AREA_COUNTY_DATASET,
      },
      select: { geographicAreaCode: true },
      distinct: ["geographicAreaCode"],
    });
    if (rows.length === 0) {
      return {
        status: "empty" as const,
      };
    }
    const published = new Set(rows.map((row) => row.geographicAreaCode));
    const missing = plan.oewsAreaCounties.filter(
      (row) => !published.has(row.geographicAreaCode),
    );
    const missingCodes = new Set(missing.map((row) => row.geographicAreaCode));
    return {
      status: "compared" as const,
      counties: missing.length,
      areas: missingCodes.size,
    };
  } catch (error) {
    if (isMissingRelation(error)) {
      return { status: "missing-table" as const };
    }
    return { status: "unavailable" as const, message: errorText(error) };
  }
}

function printPlan(input: {
  write: boolean;
  hospitalsSource: string;
  definitionsSource: string;
  oeAreaSource: string;
  censusSource: string;
  plan: GeographyPlan;
}) {
  const summary = input.plan.summary;
  console.log("");
  console.log("======================================");
  console.log(
    input.write
      ? " OEWS Geography Population - WRITE MODE"
      : " OEWS Geography Population - DRY RUN",
  );
  console.log("======================================");
  console.log(
    `Hospital county source: ${HOSPITAL_COUNTY_SOURCE} / ${HOSPITAL_COUNTY_DATASET}`,
  );
  console.log(`  Census file: ${input.censusSource}`);
  console.log(
    `OEWS area source:       ${OEWS_AREA_COUNTY_SOURCE} / ${OEWS_AREA_COUNTY_DATASET}`,
  );
  console.log(`  Definitions: ${input.definitionsSource}`);
  console.log(`  Benchmark areas (oe.area): ${input.oeAreaSource}`);
  console.log(`Hospitals: ${input.hospitalsSource}`);
  console.log("");
  console.log(`Total hospitals:                         ${summary.totalHospitals}`);
  console.log(`Resolved:                                ${summary.resolved}`);
  console.log(`Unresolved:                              ${summary.unresolved}`);
  console.log(`Metropolitan mapped:                     ${summary.metroMapped}`);
  console.log(`Nonmetropolitan mapped:                  ${summary.nonmetroMapped}`);
  console.log(`Territory / unmappable:                  ${summary.territoryUnmappable}`);
  console.log("");
  console.log(
    `Hospital county resolutions:             ${summary.hospitalCountyResolutions}`,
  );
  console.log(
    `OEWS county mappings:                    ${summary.oewsCountyMappings}`,
  );
  console.log(
    `Duplicate logical identities:            ${summary.duplicateLogicalIdentities}`,
  );
  console.log(
    `OEWS counties with no benchmark area:    ${summary.countiesWithoutBenchmarkArea}`,
  );
  console.log("");
  console.log(
    `Prototype baseline (CMS extract, September 2026): ${PROTOTYPE_HOSPITAL_RESOLUTIONS} resolutions, ${PROTOTYPE_UNRESOLVED_HOSPITALS} unresolved, 3222 OEWS counties.`,
  );
  const deviations: string[] = [];
  if (summary.resolved !== PROTOTYPE_HOSPITAL_RESOLUTIONS) {
    deviations.push(
      `resolved ${summary.resolved} vs ${PROTOTYPE_HOSPITAL_RESOLUTIONS}`,
    );
  }
  if (summary.unresolved !== PROTOTYPE_UNRESOLVED_HOSPITALS) {
    deviations.push(
      `unresolved ${summary.unresolved} vs ${PROTOTYPE_UNRESOLVED_HOSPITALS}`,
    );
  }
  if (summary.oewsCountyMappings !== 3222) {
    deviations.push(`OEWS counties ${summary.oewsCountyMappings} vs 3222`);
  }
  if (deviations.length === 0) {
    console.log("No deviation from the prototype baseline.");
  } else {
    console.log("Deviation from the prototype baseline:");
    for (const line of deviations) {
      console.log(`  ${line}`);
    }
    console.log(
      "Hospital counts follow the CMS Hospital General Information extract (xubh-q36u). A difference means that extract changed after the September 2026 prototype. OEWS county count follows area_definitions_m2025.xlsx.",
    );
  }

  if (input.plan.countiesWithoutBenchmarkArea.length > 0) {
    console.log("");
    console.log("OEWS counties with no corresponding benchmark area:");
    for (const row of input.plan.countiesWithoutBenchmarkArea.slice(0, SAMPLE_LIMIT)) {
      console.log(
        `  ${row.countyFips} ${row.countyName} → ${row.geographicAreaCode} ${row.geographicAreaName}`,
      );
    }
  }

  console.log("");
  console.log("Unresolved hospitals");
  if (input.plan.unresolved.length === 0) {
    console.log("  (none)");
  }
  for (const row of input.plan.unresolved) {
    console.log(
      `  ${row.ccn} ${row.name} | ${row.city}, ${row.state} | county ${row.county ?? ""} | ${row.method} | ${row.reason}`,
    );
  }

  console.log("");
  console.log("Verification hospitals");
  for (const row of input.plan.verification) {
    const mark = row.ok ? "ok" : "FAILED";
    console.log(`  [${mark}] ${row.ccn} ${row.label}`);
    console.log(`         ${row.detail}`);
  }

  if (input.plan.validationErrors.length > 0) {
    console.log("");
    console.log("Validation errors:");
    for (const error of input.plan.validationErrors.slice(0, SAMPLE_LIMIT)) {
      console.log(`- ${error}`);
    }
  }
  console.log("");
}

async function createManyInChunks<T>(
  rows: T[],
  write: (slice: T[]) => Promise<unknown>,
) {
  const size = 1000;
  for (let index = 0; index < rows.length; index += size) {
    await write(rows.slice(index, index + size));
  }
}

async function writePlan(
  prisma: PrismaClient,
  hospitals: HospitalCountyPlanRow[],
  areas: OewsAreaCountyPlanRow[],
) {
  return prisma.$transaction(
    async (tx) => {
      const existingAreas = await tx.oewsAreaCounty.findMany({
        where: {
          source: OEWS_AREA_COUNTY_SOURCE,
          sourceDataset: OEWS_AREA_COUNTY_DATASET,
        },
        select: { countyFips: true },
      });
      const existingAreaFips = new Set(
        existingAreas.map((row) => row.countyFips),
      );
      const areasToCreate = areas.filter(
        (row) => !existingAreaFips.has(row.countyFips),
      );
      const areasToUpdate = areas.filter((row) =>
        existingAreaFips.has(row.countyFips),
      );

      await createManyInChunks(areasToCreate, (data) =>
        tx.oewsAreaCounty.createMany({ data }),
      );
      for (const row of areasToUpdate) {
        await tx.oewsAreaCounty.update({
          where: {
            countyFips_source_sourceDataset: {
              countyFips: row.countyFips,
              source: row.source,
              sourceDataset: row.sourceDataset,
            },
          },
          data: {
            geographicAreaCode: row.geographicAreaCode,
            geographicAreaName: row.geographicAreaName,
            geographicLevel: row.geographicLevel,
          },
        });
      }

      const existingHospitals = await tx.hospitalCountyResolution.findMany({
        where: {
          source: HOSPITAL_COUNTY_SOURCE,
          sourceDataset: HOSPITAL_COUNTY_DATASET,
        },
        select: { hospitalCcn: true },
      });
      const existingCcns = new Set(
        existingHospitals.map((row) => row.hospitalCcn),
      );
      const hospitalsToCreate = hospitals.filter(
        (row) => !existingCcns.has(row.hospitalCcn),
      );
      const hospitalsToUpdate = hospitals.filter((row) =>
        existingCcns.has(row.hospitalCcn),
      );

      await createManyInChunks(hospitalsToCreate, (data) =>
        tx.hospitalCountyResolution.createMany({ data }),
      );
      for (const row of hospitalsToUpdate) {
        await tx.hospitalCountyResolution.update({
          where: {
            hospitalCcn_source_sourceDataset: {
              hospitalCcn: row.hospitalCcn,
              source: row.source,
              sourceDataset: row.sourceDataset,
            },
          },
          data: {
            countyFips: row.countyFips,
            countyName: row.countyName,
            stateFips: row.stateFips,
            stateCode: row.stateCode,
            resolutionMethod: row.resolutionMethod,
          },
        });
      }

      return {
        areasCreated: areasToCreate.length,
        areasUpdated: areasToUpdate.length,
        hospitalsCreated: hospitalsToCreate.length,
        hospitalsUpdated: hospitalsToUpdate.length,
      };
    },
    { maxWait: 20_000, timeout: WRITE_TIMEOUT_MS },
  );
}

async function main() {
  const { write, refresh, hospitalsPath } = parseArgs(process.argv.slice(2));
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const definitionsFile = await loadBytes({
    label: "BLS area definitions",
    url: DEFINITIONS_URL,
    fixturePath: path.join(FIXTURE_DIR, "area_definitions_m2025.xlsx"),
    cachePath: path.join(CACHE_DIR, "area_definitions_m2025.xlsx"),
    refresh,
    valid: isXlsx,
  });
  const oeAreaFile = await loadBytes({
    label: "BLS oe.area",
    url: OE_AREA_URL,
    fixturePath: path.join(FIXTURE_DIR, "oe.area"),
    cachePath: path.join(CACHE_DIR, "oe.area"),
    refresh,
    valid: isOeArea,
  });
  const censusFile = await loadBytes({
    label: "Census geocodes",
    url: GEOCODES_URL,
    fixturePath: null,
    cachePath: path.join(CACHE_DIR, "all-geocodes-v2024.xlsx"),
    refresh,
    valid: isXlsx,
  });
  const hospitalsFile = hospitalsPath
    ? { hospitals: hospitalsFromJson(hospitalsPath), source: hospitalsPath }
    : await downloadCmsHospitals(refresh);

  const definitions = parseBlsAreaDefinitions(
    readFirstSheetRows(definitionsFile.bytes, "BLS area definitions"),
  );
  const oeArea = parseOeArea(textOf(oeAreaFile.bytes));
  const census = parseCensusGeocodes(
    readFirstSheetRows(censusFile.bytes, "Census geocodes"),
  );
  const matches = resolveHospitals(
    hospitalsFile.hospitals,
    {
      byCountyFips: new Map(
        definitions.map((row) => [
          row.countyFips,
          {
            countyFips: row.countyFips,
            countyName: row.countyName,
            stateAbbrev: row.stateAbbrev,
            geographicAreaCode: row.geographicAreaCode,
            geographicAreaName: row.geographicAreaName,
            geographicLevel: row.geographicLevel,
            cbsaCode: row.cbsaCode,
          },
        ]),
      ),
      unlinked: [],
    },
    census.ctTowns,
    census.counties,
  );
  const plan = buildGeographyPlan({
    hospitals: hospitalsFile.hospitals,
    matches,
    counties: census.counties,
    definitions,
    benchmarkAreaCodes: new Set(
      oeArea.markets.map((market) => market.geographicAreaCode),
    ),
    officialRelease: true,
    checkCensusCoverage: true,
    requireVerificationHospitals: !hospitalsPath,
  });

  printPlan({
    write,
    hospitalsSource: hospitalsFile.source,
    definitionsSource: definitionsFile.source,
    oeAreaSource: oeAreaFile.source,
    censusSource: censusFile.source,
    plan,
  });

  if (plan.validationErrors.length > 0) {
    throw new Error(
      "Validation failed. Database was not modified. Valid rows were not partially written.",
    );
  }

  const prisma = connectPrisma();
  if (!prisma) {
    if (write) {
      throw new Error("DATABASE_URL is not set. Database was not modified.");
    }
    console.log("DATABASE_URL is not set. Insert/update counts were not queried.");
    console.log("DRY RUN COMPLETE.");
    console.log("No database records were inserted, updated, or deleted.");
    console.log("Use --write only after validation has been reviewed.");
    console.log(
      "Apply prisma/migrations locally before --write. This script does not migrate.",
    );
    return;
  }

  const plannedAreaFips = new Set(
    plan.oewsAreaCounties.map((row) => row.countyFips),
  );
  const plannedCcns = new Set(
    plan.hospitalResolutions.map((row) => row.hospitalCcn),
  );
  const areaCounts = await countExisting(
    async () => {
      const rows = await prisma.oewsAreaCounty.findMany({
        where: {
          source: OEWS_AREA_COUNTY_SOURCE,
          sourceDataset: OEWS_AREA_COUNTY_DATASET,
        },
        select: { countyFips: true },
      });
      return rows.map((row) => row.countyFips);
    },
    plannedAreaFips,
  );
  const hospitalCounts = await countExisting(
    async () => {
      const rows = await prisma.hospitalCountyResolution.findMany({
        where: {
          source: HOSPITAL_COUNTY_SOURCE,
          sourceDataset: HOSPITAL_COUNTY_DATASET,
        },
        select: { hospitalCcn: true },
      });
      return rows.map((row) => row.hospitalCcn);
    },
    plannedCcns,
  );

  if (areaCounts.available && hospitalCounts.available) {
    console.log(`OEWS rows that would insert:             ${areaCounts.wouldInsert}`);
    console.log(`OEWS rows that would update:             ${areaCounts.wouldUpdate}`);
    console.log(
      `OEWS rows outside this plan, same release, left in place: ${areaCounts.outsidePlan}`,
    );
    console.log(
      `Hospital rows that would insert:         ${hospitalCounts.wouldInsert}`,
    );
    console.log(
      `Hospital rows that would update:         ${hospitalCounts.wouldUpdate}`,
    );
    console.log(
      `Hospital rows outside this plan, same release, left in place: ${hospitalCounts.outsidePlan}`,
    );
  } else {
    console.log(
      "Geography tables are not available. Insert/update counts were not queried.",
    );
    console.log(
      "Apply prisma/migrations locally before --write. This script does not migrate.",
    );
  }

  const wageGap = await benchmarkAreaGap(prisma, plan);
  if (wageGap.status === "empty" || wageGap.status === "missing-table") {
    console.log(
      "LocalPayBenchmark has no OEWS-2025-MAY rows in this database. Geography import does not require them. Benchmark area membership was checked against oe.area.",
    );
  } else if (wageGap.status === "compared") {
    console.log(
      `OEWS counties whose area code has no LocalPayBenchmark row for ${OEWS_AREA_COUNTY_SOURCE} / ${OEWS_AREA_COUNTY_DATASET}: ${wageGap.counties} counties across ${wageGap.areas} areas`,
    );
  } else {
    console.log(`LocalPayBenchmark comparison skipped: ${wageGap.message}`);
  }

  let missingCcns: string[] = [];
  try {
    missingCcns = await missingHospitalCcns(
      prisma,
      plan.hospitalResolutions.map((row) => row.hospitalCcn),
    );
  } catch (error) {
    if (write) {
      throw new Error(
        `Could not confirm hospitals before write: ${errorText(error)}`,
      );
    }
    console.log(`Hospital table was not compared: ${errorText(error)}`);
    missingCcns = [];
  }

  if (missingCcns.length > 0) {
    console.log("");
    console.log(
      `Planned resolutions whose CCN is not in hospitals: ${missingCcns.length}`,
    );
    for (const ccn of missingCcns.slice(0, SAMPLE_LIMIT)) {
      console.log(`  ${ccn}`);
    }
    if (missingCcns.length > SAMPLE_LIMIT) {
      console.log(`  … ${missingCcns.length - SAMPLE_LIMIT} more`);
    }
  }

  console.log("");
  console.log(
    "Writes run in one transaction. A failure rolls every geography upsert back. Rows outside this import plan are not deleted.",
  );

  if (!write) {
    if (missingCcns.length > 0) {
      console.log(
        "WRITE WOULD BE BLOCKED until every planned CCN exists in hospitals.",
      );
    }
    console.log("DRY RUN COMPLETE.");
    console.log("No database records were inserted, updated, or deleted.");
    console.log("Use --write only after validation has been reviewed.");
    return;
  }

  if (!areaCounts.available || !hospitalCounts.available) {
    throw new Error(
      "Geography tables are not in this database. Apply migrations locally, then re-run --write. This script does not migrate. Database was not modified.",
    );
  }
  if (missingCcns.length > 0) {
    const noun =
      missingCcns.length === 1
        ? "1 planned hospital CCN is"
        : `${missingCcns.length} planned hospital CCNs are`;
    throw new Error(
      `${noun} not in hospitals. Database was not modified.`,
    );
  }

  console.log("Connecting to PostgreSQL...");
  console.log("Beginning geography upsert...");
  const written = await writePlan(
    prisma,
    plan.hospitalResolutions,
    plan.oewsAreaCounties,
  );
  console.log("");
  console.log("======================================");
  console.log(" OEWS GEOGRAPHY POPULATION COMPLETE");
  console.log("======================================");
  console.log(`OEWS counties created: ${written.areasCreated}`);
  console.log(`OEWS counties updated: ${written.areasUpdated}`);
  console.log(`Hospital counties created: ${written.hospitalsCreated}`);
  console.log(`Hospital counties updated: ${written.hospitalsUpdated}`);
  console.log("Rows outside this import plan were not deleted.");
}

main()
  .catch((error: unknown) => {
    console.error("");
    console.error("OEWS GEOGRAPHY POPULATION FAILED:");
    console.error(errorText(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaHolder.client?.$disconnect();
  });
