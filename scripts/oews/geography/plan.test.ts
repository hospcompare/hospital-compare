import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { readFirstSheetRows } from "../area-mapping/read-sheet";
import { resolveHospitals } from "../area-mapping/resolve";
import {
  parseBlsAreaDefinitions,
  parseOeArea,
  type BlsAreaDefinition,
} from "../area-mapping/sources";
import type {
  CensusCounty,
  CtTown,
  HospitalGeoInput,
} from "../area-mapping/types";
import {
  EXPECTED_OEWS_COUNTY_MAPPINGS,
  HOSPITAL_COUNTY_DATASET,
  HOSPITAL_COUNTY_SOURCE,
  OEWS_AREA_COUNTY_DATASET,
  OEWS_AREA_COUNTY_SOURCE,
  buildGeographyPlan,
} from "./plan";

const fixtureDir = path.resolve("data/fixtures/oews-may-2025");
const definitions = parseBlsAreaDefinitions(
  readFirstSheetRows(
    new Uint8Array(
      fs.readFileSync(path.join(fixtureDir, "area_definitions_m2025.xlsx")),
    ),
    "area definitions",
  ),
);
const oeArea = parseOeArea(
  fs.readFileSync(path.join(fixtureDir, "oe.area"), "utf8"),
);
const benchmarkAreaCodes = new Set(
  oeArea.markets.map((market) => market.geographicAreaCode),
);
const examples = JSON.parse(
  fs.readFileSync(path.join(fixtureDir, "example-hospitals.json"), "utf8"),
) as HospitalGeoInput[];

const ctTowns: CtTown[] = [{ countyFips: "09110", name: "Hartford town" }];

function definition(
  overrides: Partial<BlsAreaDefinition> & Pick<BlsAreaDefinition, "countyFips">,
): BlsAreaDefinition {
  return {
    stateAbbrev: "WA",
    stateFips: "53",
    countyFips3: overrides.countyFips.slice(2),
    countyName: "Kitsap County",
    geographicAreaCode: "14740",
    geographicAreaName: "Bremerton-Silverdale-Port Orchard, WA",
    geographicLevel: "Metropolitan Statistical Area",
    cbsaCode: "14740",
    ...overrides,
  };
}

function censusFor(rows: BlsAreaDefinition[]): CensusCounty[] {
  return rows.map((row) => ({
    stateAbbrev: row.stateAbbrev,
    stateFips: row.stateFips,
    countyFips3: row.countyFips3,
    name: row.countyName,
  }));
}

test("May 2025 workbook plans 3222 OEWS counties with preserved area codes", () => {
  const plan = buildGeographyPlan({
    hospitals: [],
    matches: [],
    counties: [],
    definitions,
    benchmarkAreaCodes,
    officialRelease: true,
    checkCensusCoverage: false,
    requireVerificationHospitals: false,
  });

  assert.equal(plan.validationErrors.length, 0, plan.validationErrors.join("\n"));
  assert.equal(plan.summary.oewsCountyMappings, EXPECTED_OEWS_COUNTY_MAPPINGS);
  assert.equal(plan.summary.countiesWithoutBenchmarkArea, 0);
  assert.equal(plan.summary.duplicateLogicalIdentities, 0);
  assert.equal(plan.oewsAreaCounties[0]?.source, OEWS_AREA_COUNTY_SOURCE);
  assert.equal(plan.oewsAreaCounties[0]?.sourceDataset, OEWS_AREA_COUNTY_DATASET);
  assert.equal(OEWS_AREA_COUNTY_SOURCE, "BLS OEWS");
  assert.equal(OEWS_AREA_COUNTY_DATASET, "OEWS-2025-MAY");

  const alaska = plan.oewsAreaCounties.find((row) =>
    row.countyFips.startsWith("02"),
  );
  assert.ok(alaska);
  assert.match(alaska.countyFips, /^02\d{3}$/);

  const northeastAlabama = plan.oewsAreaCounties.find(
    (row) => row.geographicAreaCode === "0100002",
  );
  assert.ok(northeastAlabama);
  assert.equal(northeastAlabama.geographicAreaCode, "0100002");
  assert.equal(northeastAlabama.geographicLevel, "Nonmetropolitan Area");
  assert.equal(northeastAlabama.countyFips.length, 5);
});

test("example hospitals keep Census identity separate from the OEWS area", () => {
  const neededFips = new Set([
    "53035",
    "55025",
    "37183",
    "53033",
    "53009",
    "09110",
    "11001",
    "22033",
    "17037",
    "51067",
    "51620",
    "18089",
    "51095",
  ]);
  const census = censusFor(
    definitions.filter((row) => neededFips.has(row.countyFips)),
  );
  const matches = resolveHospitals(examples, {
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
  }, ctTowns, census);

  const plan = buildGeographyPlan({
    hospitals: examples,
    matches,
    counties: census,
    definitions,
    benchmarkAreaCodes,
    officialRelease: true,
    checkCensusCoverage: false,
    requireVerificationHospitals: true,
  });

  assert.equal(plan.validationErrors.length, 0, plan.validationErrors.join("\n"));
  assert.equal(plan.summary.totalHospitals, examples.length);
  assert.equal(plan.summary.unresolved, 3);
  assert.equal(plan.summary.territoryUnmappable, 1);
  assert.equal(plan.summary.resolved, examples.length - 3);
  assert.deepEqual(
    plan.unresolved.map((row) => row.ccn),
    ["021301", "070008", "650001"],
  );
  assert.equal(
    plan.unresolved.find((row) => row.ccn === "650001")?.method,
    "outside_oews_metro_nonmetro_coverage",
  );
  assert.equal(
    plan.hospitalResolutions.some((row) => row.hospitalCcn === "021301"),
    false,
  );

  const stMichael = plan.hospitalResolutions.find(
    (row) => row.hospitalCcn === "500039",
  );
  assert.ok(stMichael);
  assert.equal(stMichael.countyFips, "53035");
  assert.equal(stMichael.stateFips, "53");
  assert.equal(stMichael.stateCode, "WA");
  assert.match(stMichael.countyName, /Kitsap/);
  assert.equal(stMichael.source, HOSPITAL_COUNTY_SOURCE);
  assert.equal(stMichael.sourceDataset, HOSPITAL_COUNTY_DATASET);
  assert.notEqual(stMichael.sourceDataset, OEWS_AREA_COUNTY_DATASET);
  assert.equal(
    plan.oewsAreaCounties.find((row) => row.countyFips === "53035")
      ?.geographicAreaCode,
    "14740",
  );

  const hartford = plan.hospitalResolutions.find(
    (row) => row.hospitalCcn === "070002",
  );
  assert.equal(hartford?.countyFips, "09110");
  assert.equal(hartford?.stateFips, "09");
  assert.equal(hartford?.stateCode, "CT");

  for (const result of plan.verification) {
    assert.equal(result.ok, true, `${result.ccn} ${result.detail}`);
    assert.equal(result.geographicAreaCode, result.expectedAreaCode);
  }
});

test("one county cannot map to two OEWS areas in the same release", () => {
  const rows = [
    definition({ countyFips: "53035", countyFips3: "035" }),
    definition({
      countyFips: "53035",
      countyFips3: "035",
      geographicAreaCode: "42660",
      geographicAreaName: "Seattle-Tacoma-Bellevue, WA",
      cbsaCode: "42660",
    }),
  ];
  const plan = buildGeographyPlan({
    hospitals: [],
    matches: [],
    counties: censusFor([rows[0]]),
    definitions: rows,
    benchmarkAreaCodes,
    officialRelease: false,
    checkCensusCoverage: true,
    requireVerificationHospitals: false,
  });

  assert.equal(plan.oewsAreaCounties.length, 0);
  assert.equal(plan.summary.duplicateLogicalIdentities, 1);
  assert.match(plan.validationErrors.join("\n"), /more than one OEWS area/);
});

test("FIPS values that lost leading zeroes are rejected", () => {
  const row = definition({
    countyFips: "2020",
    stateFips: "02",
    stateAbbrev: "AK",
    countyFips3: "020",
    countyName: "Anchorage Municipality",
  });
  const plan = buildGeographyPlan({
    hospitals: [],
    matches: [],
    counties: [],
    definitions: [row],
    benchmarkAreaCodes,
    officialRelease: false,
    checkCensusCoverage: false,
    requireVerificationHospitals: false,
  });

  assert.equal(plan.oewsAreaCounties.length, 0);
  assert.match(plan.validationErrors.join("\n"), /leading zeroes/);
});

test("duplicate hospital CCNs are not written", () => {
  const hospital: HospitalGeoInput = {
    ccn: "500039",
    name: "ST MICHAEL MEDICAL CENTER",
    city: "SILVERDALE",
    state: "WA",
    zip: "98383",
    county: "KITSAP",
  };
  const kitsap = definition({ countyFips: "53035", countyFips3: "035" });
  const plan = buildGeographyPlan({
    hospitals: [hospital, hospital],
    matches: [
      {
        ccn: "500039",
        status: "mapped",
        method: "census_suffix",
        countyFips: "53035",
        countyName: "Kitsap County",
        geographicAreaCode: "14740",
        geographicAreaName: "Bremerton-Silverdale-Port Orchard, WA",
        geographicLevel: "Metropolitan Statistical Area",
        cbsaCode: "14740",
      },
      {
        ccn: "500039",
        status: "mapped",
        method: "census_suffix",
        countyFips: "53035",
        countyName: "Kitsap County",
        geographicAreaCode: "14740",
        geographicAreaName: "Bremerton-Silverdale-Port Orchard, WA",
        geographicLevel: "Metropolitan Statistical Area",
        cbsaCode: "14740",
      },
    ],
    counties: censusFor([kitsap]),
    definitions: [kitsap],
    benchmarkAreaCodes,
    officialRelease: false,
    checkCensusCoverage: false,
    requireVerificationHospitals: false,
  });

  assert.equal(plan.hospitalResolutions.length, 0);
  assert.match(plan.validationErrors.join("\n"), /Duplicate hospital logical identity/);
});

test("an OEWS county whose area is not a benchmark market is reported", () => {
  const row = definition({
    countyFips: "53035",
    countyFips3: "035",
    geographicAreaCode: "99999",
    cbsaCode: "99999",
  });
  const plan = buildGeographyPlan({
    hospitals: [],
    matches: [],
    counties: censusFor([row]),
    definitions: [row],
    benchmarkAreaCodes: new Set(["14740"]),
    officialRelease: false,
    checkCensusCoverage: true,
    requireVerificationHospitals: false,
  });

  assert.equal(plan.summary.countiesWithoutBenchmarkArea, 1);
  assert.equal(plan.countiesWithoutBenchmarkArea[0]?.geographicAreaCode, "99999");
  assert.match(plan.validationErrors.join("\n"), /no corresponding May 2025 benchmark area/);
});
