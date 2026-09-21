import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "csv-parse/sync";
import { strToU8, zipSync } from "fflate";
import { adaptOewsMay2025Zip } from "./adapt";
import {
  NORMALIZED_BENCHMARK_COLUMNS,
  OEWS_MAY_2025_DATASET,
  OEWS_MAY_2025_EFFECTIVE_DATE,
  OEWS_MAY_2025_SOURCE,
  OEWS_MAY_2025_SOURCE_URL,
} from "./constants";
import { csvField, writeBenchmarkCsv } from "./csv";
import { OewsAdapterError } from "./errors";
import { parseWageCell } from "./wages";

const HEADERS = [
  "AREA",
  "AREA_TITLE",
  "AREA_TYPE",
  "NAICS",
  "I_GROUP",
  "OWN_CODE",
  "OCC_CODE",
  "OCC_TITLE",
  "H_MEAN",
  "A_MEAN",
  "H_MEDIAN",
  "A_MEDIAN",
] as const;

type Header = (typeof HEADERS)[number];

const WAGE_HEADERS = new Set<Header>([
  "H_MEAN",
  "A_MEAN",
  "H_MEDIAN",
  "A_MEDIAN",
]);

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function columnLetter(index: number) {
  return String.fromCharCode(65 + index);
}

function row(values: Partial<Record<Header, string>>) {
  const defaults: Record<Header, string> = {
    AREA: "",
    AREA_TITLE: "",
    AREA_TYPE: "4",
    NAICS: "000000",
    I_GROUP: "cross-industry",
    OWN_CODE: "1235",
    OCC_CODE: "29-1141",
    OCC_TITLE: "Registered Nurses",
    H_MEAN: "",
    A_MEAN: "",
    H_MEDIAN: "",
    A_MEDIAN: "",
  };
  return HEADERS.map((header) => values[header] ?? defaults[header]);
}

function workbookBytes(dataRows: string[][]) {
  const shared: string[] = [];
  const sharedIndex = (value: string) => {
    const existing = shared.indexOf(value);
    if (existing >= 0) {
      return existing;
    }
    shared.push(value);
    return shared.length - 1;
  };

  const sheetRows = [[...HEADERS], ...dataRows].map((cells, rowIndex) => {
    const excelRow = rowIndex + 1;
    const encoded = cells.flatMap((value, columnIndex) => {
      if (value === "") {
        return [];
      }
      const ref = `${columnLetter(columnIndex)}${excelRow}`;
      const header = HEADERS[columnIndex];
      const numeric =
        rowIndex > 0 &&
        WAGE_HEADERS.has(header) &&
        /^\d+(?:\.\d+)?$/.test(value);
      if (numeric) {
        return [`<c r="${ref}"><v>${value}</v></c>`];
      }
      return [`<c r="${ref}" t="s"><v>${sharedIndex(value)}</v></c>`];
    });
    return `<row r="${excelRow}">${encoded.join("")}</row>`;
  });

  const sharedXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared
    .map((value) => `<si><t>${xmlEscape(value)}</t></si>`)
    .join("")}</sst>`;
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows.join("")}</sheetData></worksheet>`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="DATA_dl" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

  return zipSync({
    "xl/workbook.xml": strToU8(workbookXml),
    "xl/_rels/workbook.xml.rels": strToU8(relsXml),
    "xl/sharedStrings.xml": strToU8(sharedXml),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml),
  });
}

function archive(msaRows: string[][], bosRows: string[][]) {
  return zipSync({
    "oesm25ma/MSA_M2025_dl.xlsx": workbookBytes(msaRows),
    "oesm25ma/BOS_M2025_dl.xlsx": workbookBytes(bosRows),
  });
}

const abilene = row({
  AREA: "10180",
  AREA_TITLE: "Abilene, TX",
  AREA_TYPE: "4",
  H_MEAN: "40.950000000000003",
  A_MEAN: "85170",
  H_MEDIAN: "38.58",
  A_MEDIAN: "80240",
});

const northwestAlabama = row({
  AREA: "0100001",
  AREA_TITLE: "Northwest Alabama nonmetropolitan area",
  AREA_TYPE: "6",
  H_MEAN: "31.28",
  A_MEAN: "65070",
  H_MEDIAN: "31.03",
  A_MEDIAN: "64540",
});

const bayCitySuppressed = row({
  AREA: "13020",
  AREA_TITLE: "Bay City, MI",
  AREA_TYPE: "4",
  H_MEAN: "*",
  A_MEAN: "*",
  H_MEDIAN: "*",
  A_MEDIAN: "*",
});

const guamSuppressed = row({
  AREA: "6600001",
  AREA_TITLE: "Guam",
  AREA_TYPE: "6",
  H_MEAN: "*",
  A_MEAN: "*",
  H_MEDIAN: "*",
  A_MEDIAN: "*",
});

function sampleArchive() {
  return archive(
    [
      row({
        AREA: "10180",
        AREA_TITLE: "Abilene, TX",
        OCC_CODE: "00-0000",
        OCC_TITLE: "All Occupations",
      }),
      row({
        AREA: "10180",
        AREA_TITLE: "Abilene, TX",
        OCC_CODE: "29-1171",
        OCC_TITLE: "Nurse Practitioners",
      }),
      row({
        AREA: "10180",
        AREA_TITLE: "Abilene, TX",
        NAICS: "622110",
        I_GROUP: "4-digit",
        OWN_CODE: "5",
        H_MEAN: "*",
        A_MEAN: "*",
        H_MEDIAN: "*",
        A_MEDIAN: "*",
      }),
      abilene,
      bayCitySuppressed,
      row({
        AREA: "FORMAT-HASH",
        AREA_TITLE: "Top-code marker fixture",
        H_MEAN: "#",
        A_MEAN: "#",
        H_MEDIAN: "#",
        A_MEDIAN: "#",
      }),
    ],
    [northwestAlabama, guamSuppressed],
  );
}

test("published OEWS wage text keeps official cents and dollars", () => {
  assert.deepEqual(parseWageCell("40.950000000000003", "H_MEAN", 6), {
    kind: "value",
    value: "40.95",
  });
  assert.deepEqual(parseWageCell("38.58", "H_MEDIAN", 6), {
    kind: "value",
    value: "38.58",
  });
  assert.deepEqual(parseWageCell("85170", "A_MEAN", 10), {
    kind: "value",
    value: "85170.00",
  });
  assert.equal(parseWageCell("*", "H_MEAN", 6).kind, "unavailable");
  assert.equal(parseWageCell("#", "H_MEAN", 6).kind, "top-coded");
  assert.equal(parseWageCell("**", "H_MEAN", 6).kind, "employment-unavailable");
  assert.equal(parseWageCell("  ", "H_MEAN", 6).kind, "blank");
  assert.throws(
    () => parseWageCell("14.875", "H_MEAN", 6),
    /was not rounded/,
  );
  assert.throws(
    () => parseWageCell("~", "H_MEAN", 6),
    OewsAdapterError,
  );
});

test("quotes area names that contain commas or quotes", () => {
  assert.equal(csvField("Abilene, TX"), '"Abilene, TX"');
  assert.equal(csvField('Say "RN"'), '"Say ""RN"""');
  assert.equal(csvField("0100001"), "0100001");
});

test("maps official RN rows and suppresses unpublished wages", () => {
  const { rows, report } = adaptOewsMay2025Zip(sampleArchive());
  const csv = writeBenchmarkCsv(rows);
  const parsed = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  }) as Record<string, string>[];

  assert.deepEqual(Object.keys(parsed[0]), [...NORMALIZED_BENCHMARK_COLUMNS]);
  assert.equal(parsed.length, 2);
  assert.equal(csv.includes("FORMAT-HASH"), false);
  assert.equal(csv.includes("29-1171"), false);
  assert.equal(csv.includes("Nurse Practitioners"), false);
  assert.match(csv, /"Abilene, TX"/);

  assert.deepEqual(parsed[0], {
    professionSlug: "registered-nurse",
    geographicAreaCode: "10180",
    geographicAreaName: "Abilene, TX",
    geographicLevel: "Metropolitan Statistical Area",
    hourlyMean: "40.95",
    hourlyMedian: "38.58",
    annualMean: "85170.00",
    annualMedian: "80240.00",
    source: OEWS_MAY_2025_SOURCE,
    sourceDataset: OEWS_MAY_2025_DATASET,
    sourceUrl: OEWS_MAY_2025_SOURCE_URL,
    effectiveDate: OEWS_MAY_2025_EFFECTIVE_DATE,
  });
  assert.equal(parsed[1].geographicAreaCode, "0100001");
  assert.equal(
    parsed[1].geographicAreaName,
    "Northwest Alabama nonmetropolitan area",
  );
  assert.equal(parsed[1].geographicLevel, "Nonmetropolitan Area");
  assert.equal(parsed[1].hourlyMean, "31.28");
  assert.equal(parsed[1].hourlyMedian, "31.03");
  assert.equal(parsed[1].annualMean, "65070.00");
  assert.equal(parsed[1].annualMedian, "64540.00");

  assert.equal(report.totalSourceRowsRead, 8);
  assert.equal(report.rnRowsFound, 6);
  assert.equal(report.normalizedRowsProduced, 2);
  assert.equal(report.metropolitanCount, 1);
  assert.equal(report.nonmetropolitanCount, 1);
  assert.equal(report.duplicateGeographyIdentities, 0);
  assert.equal(report.skipped.notConfiguredOccupation, 2);
  assert.equal(report.skipped.notCrossIndustryCrossOwnership, 1);
  assert.equal(report.skipped.allWagesUnpublished, 3);
  assert.equal(report.unpublishedByMarker.unavailable, 8);
  assert.equal(report.unpublishedByMarker.topCoded, 4);
  assert.deepEqual(
    report.skippedUnpublishedAreas.map((area) => area.geographicAreaCode),
    ["13020", "FORMAT-HASH", "6600001"],
  );
});

test("duplicate RN geography identities abort instead of overwriting", () => {
  assert.throws(
    () => adaptOewsMay2025Zip(archive([abilene, abilene], [])),
    (error: unknown) => {
      assert.ok(error instanceof OewsAdapterError);
      assert.match(error.message, /Duplicate RN geography identities: 1/);
      assert.match(error.message, /10180/);
      assert.match(error.message, /Metropolitan Statistical Area/);
      return true;
    },
  );
});

test("area type must match the official workbook", () => {
  assert.throws(
    () =>
      adaptOewsMay2025Zip(
        archive(
          [],
          [
            row({
              AREA: "0100001",
              AREA_TITLE: "Northwest Alabama nonmetropolitan area",
              AREA_TYPE: "4",
              H_MEAN: "31.28",
              A_MEAN: "65070",
              H_MEDIAN: "31.03",
              A_MEDIAN: "64540",
            }),
          ],
        ),
      ),
    /AREA_TYPE "4"/,
  );
});
