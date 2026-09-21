import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { normalizeGeographyName } from "./names";
import { readFirstSheetRows } from "./read-sheet";
import { resolveHospitals } from "./resolve";
import {
  assignmentsFromBlsDefinitions,
  parseBlsAreaDefinitions,
  parseOeArea,
} from "./sources";
import type { CensusCounty, CtTown, HospitalGeoInput } from "./types";
import { indexZctaCounties, summarizeZipCheck } from "./zip-check";

const fixtureDir = path.resolve("data/fixtures/oews-may-2025");
const definitions = parseBlsAreaDefinitions(
  readFirstSheetRows(
    new Uint8Array(
      fs.readFileSync(path.join(fixtureDir, "area_definitions_m2025.xlsx")),
    ),
    "area definitions",
  ),
);
const byCountyFips = assignmentsFromBlsDefinitions(definitions);
const crosswalk = { byCountyFips, unlinked: [] };
const oeArea = parseOeArea(
  fs.readFileSync(path.join(fixtureDir, "oe.area"), "utf8"),
);

function county(
  stateAbbrev: string,
  stateFips: string,
  countyFips3: string,
  name: string,
): CensusCounty {
  return { stateAbbrev, stateFips, countyFips3, name };
}

const counties: CensusCounty[] = [
  county("WA", "53", "035", "Kitsap County"),
  county("WA", "53", "033", "King County"),
  county("WA", "53", "053", "Pierce County"),
  county("WA", "53", "061", "Snohomish County"),
  county("WA", "53", "009", "Clallam County"),
  county("WI", "55", "025", "Dane County"),
  county("NC", "37", "183", "Wake County"),
  county("NC", "37", "069", "Franklin County"),
  county("NC", "37", "101", "Johnston County"),
  county("VA", "51", "067", "Franklin County"),
  county("VA", "51", "620", "Franklin city"),
  county("IL", "17", "037", "DeKalb County"),
  county("IN", "18", "089", "Lake County"),
  county("VA", "51", "095", "James City County"),
  county("DC", "11", "001", "District of Columbia"),
  county("LA", "22", "033", "East Baton Rouge Parish"),
  county("CT", "09", "110", "Capitol Planning Region"),
];

const ctTowns: CtTown[] = [
  { countyFips: "09110", name: "Hartford town" },
];

function hospital(
  ccn: string,
  name: string,
  city: string,
  state: string,
  zip: string,
  county: string,
): HospitalGeoInput {
  return { ccn, name, city, state, zip, county };
}

const examples = JSON.parse(
  fs.readFileSync(path.join(fixtureDir, "example-hospitals.json"), "utf8"),
) as HospitalGeoInput[];

const johnston = hospital(
  "TST001",
  "Fixture Johnston County hospital",
  "SMITHFIELD",
  "NC",
  "27577",
  "JOHNSTON",
);

function byCcn(ccn: string) {
  const match = resolveHospitals(
    [...examples, johnston],
    crosswalk,
    ctTowns,
    counties,
  ).find((row) => row.ccn === ccn);
  assert.ok(match, ccn);
  return match;
}

test("May 2025 workbook counties match oe.area market codes", () => {
  assert.equal(definitions.length, 3222);
  assert.equal(byCountyFips.size, 3222);
  const areas = new Map(
    definitions.map((row) => [row.geographicAreaCode, row.geographicAreaName]),
  );
  assert.equal(areas.size, 528);
  assert.equal(oeArea.markets.length, 528);
  for (const [code, name] of areas) {
    const market = oeArea.markets.find((row) => row.geographicAreaCode === code);
    assert.ok(market, code);
    assert.equal(
      normalizeGeographyName(market.areaName),
      normalizeGeographyName(name),
    );
  }
  assert.equal(byCountyFips.get("18089")?.geographicAreaCode, "16980");
  assert.equal(byCountyFips.get("53035")?.geographicAreaCode, "14740");
});

test("example hospitals resolve to the May 2025 OEWS markets", () => {
  const bremerton = byCcn("500039");
  assert.equal(bremerton.status, "mapped");
  assert.equal(bremerton.countyFips, "53035");
  assert.equal(bremerton.geographicAreaCode, "14740");
  assert.equal(
    bremerton.geographicAreaName,
    "Bremerton-Silverdale-Port Orchard, WA",
  );
  assert.equal(bremerton.geographicLevel, "Metropolitan Statistical Area");
  assert.equal(bremerton.cbsaCode, "14740");

  const madison = byCcn("520098");
  assert.equal(madison.geographicAreaCode, "31540");
  assert.equal(madison.geographicAreaName, "Madison, WI");
  assert.equal(madison.countyFips, "55025");

  const raleigh = byCcn("340069");
  const cary = byCcn("340173");
  const smithfield = byCcn("TST001");
  assert.equal(raleigh.geographicAreaCode, "39580");
  assert.equal(raleigh.geographicAreaName, "Raleigh-Cary, NC");
  assert.equal(cary.geographicAreaCode, "39580");
  assert.equal(smithfield.geographicAreaCode, "39580");
  assert.equal(smithfield.countyFips, "37101");

  const seattle = byCcn("500064");
  assert.equal(seattle.geographicAreaCode, "42660");
  assert.equal(seattle.geographicAreaName, "Seattle-Tacoma-Bellevue, WA");
  assert.equal(seattle.countyFips, "53033");
  assert.equal(seattle.geographicLevel, "Metropolitan Statistical Area");

  const portAngeles = byCcn("500072");
  assert.equal(portAngeles.geographicAreaCode, "5300006");
  assert.equal(
    portAngeles.geographicAreaName,
    "Western Washington nonmetropolitan area",
  );
  assert.equal(portAngeles.geographicLevel, "Nonmetropolitan Area");
  assert.equal(portAngeles.cbsaCode, null);
});

test("CMS orthography, Connecticut towns, and retired counties stay deterministic", () => {
  const hartford = byCcn("070002");
  assert.equal(hartford.method, "ct_town_subdivision");
  assert.equal(hartford.countyFips, "09110");
  assert.equal(hartford.geographicAreaCode, "25540");
  assert.equal(
    hartford.geographicAreaName,
    "Hartford-West Hartford-East Hartford, CT",
  );

  const staffordSprings = byCcn("070008");
  assert.equal(staffordSprings.status, "unmapped");
  assert.equal(staffordSprings.method, "ct_town_unmatched");

  const district = byCcn("090001");
  assert.equal(district.method, "cms_published_alias");
  assert.equal(district.countyFips, "11001");
  assert.equal(district.geographicAreaCode, "47900");

  const batonRouge = byCcn("190020");
  assert.equal(batonRouge.method, "cms_compass_abbreviation");
  assert.equal(batonRouge.countyFips, "22033");
  assert.equal(batonRouge.geographicAreaCode, "12940");

  const dekalb = byCcn("140286");
  assert.equal(dekalb.method, "compact_spelling");
  assert.equal(dekalb.countyFips, "17037");

  const franklinCounty = byCcn("490089");
  const franklinCity = byCcn("490092");
  assert.equal(franklinCounty.countyFips, "51067");
  assert.equal(franklinCounty.geographicAreaCode, "40220");
  assert.equal(franklinCounty.geographicAreaName, "Roanoke, VA");
  assert.equal(franklinCity.countyFips, "51620");
  assert.equal(franklinCity.geographicAreaCode, "5100002");
  assert.equal(
    franklinCity.geographicAreaName,
    "Southside Virginia nonmetropolitan area",
  );

  const valdez = byCcn("021301");
  assert.equal(valdez.status, "unmapped");
  assert.equal(valdez.method, "retired_census_area");

  const guam = byCcn("650001");
  assert.equal(guam.status, "unmapped");
  assert.equal(guam.method, "outside_oews_metro_nonmetro_coverage");

  const lake = byCcn("150002");
  assert.equal(lake.status, "mapped");
  assert.equal(lake.countyFips, "18089");
  assert.equal(lake.geographicAreaCode, "16980");
  assert.equal(lake.geographicAreaName, "Chicago-Naperville-Elgin, IL-IN");

  const jamesCity = byCcn("490066");
  assert.equal(jamesCity.status, "mapped");
  assert.equal(jamesCity.countyFips, "51095");
  assert.equal(jamesCity.geographicAreaCode, "47260");
  assert.equal(
    jamesCity.geographicAreaName,
    "Virginia Beach-Chesapeake-Norfolk, VA-NC",
  );
});

test("a ZCTA that crosses two OEWS areas is not a sufficient ZIP-only key", () => {
  const zcta = indexZctaCounties(
    [
      "GEOID_ZCTA5_20|GEOID_COUNTY_20|AREALAND_PART",
      "99999|53033|10",
      "99999|53009|90",
    ].join("\n"),
  );
  const hospitals = [
    hospital("500064", "Harborview", "SEATTLE", "WA", "99999", "KING"),
  ];
  const matches = resolveHospitals(hospitals, crosswalk, ctTowns, counties);
  const summary = summarizeZipCheck({
    hospitals,
    matches,
    zcta,
    areaCodeByCountyFips: new Map(
      [...crosswalk.byCountyFips.entries()].map(([fips, assignment]) => [
        fips,
        assignment.geographicAreaCode,
      ]),
    ),
  });
  assert.equal(summary.zctasSpanningMultipleOewsAreas, 1);
  assert.equal(summary.multiCountyPluralityDisagrees, 1);
  assert.equal(summary.zipOnlyWouldDisagreeExcludingConnecticut, 1);
  assert.equal(matches[0]?.geographicAreaCode, "42660");
});
