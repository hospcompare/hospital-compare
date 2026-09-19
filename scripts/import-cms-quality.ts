import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const CSV_PATH = path.join(
  process.cwd(),
  "data",
  "Hospital_General_Information.csv",
);

const RELEASE_DATE = new Date("2026-08-13T00:00:00.000Z");

const SOURCE_DATASET = "CMS Hospital General Information";

const SOURCE_URL =
  "https://data.cms.gov/provider-data/dataset/xubh-q36u";

const REQUIRED_HEADERS = [
  "Facility ID",
  "Hospital overall rating",
  "Hospital overall rating footnote",
  "Count of Facility MORT Measures",
  "Count of MORT Measures Better",
  "Count of MORT Measures No Different",
  "Count of MORT Measures Worse",
  "Count of Facility Safety Measures",
  "Count of Safety Measures Better",
  "Count of Safety Measures No Different",
  "Count of Safety Measures Worse",
  "Count of Facility READM Measures",
  "Count of READM Measures Better",
  "Count of READM Measures No Different",
  "Count of READM Measures Worse",
  "Count of Facility Pt Exp Measures",
] as const;

type CsvRow = Record<string, string>;

function parseNullableInteger(
  value: string,
  fieldName: string,
  ccn: string,
): number | null {
  const trimmed = value.trim();

  if (trimmed === "Not Available") {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      `Invalid integer for ${fieldName} at CCN ${ccn}: "${value}"`,
    );
  }

  return Number.parseInt(trimmed, 10);
}

function parseOverallRating(value: string, ccn: string): number | null {
  const trimmed = value.trim();

  if (trimmed === "Not Available") {
    return null;
  }

  if (!/^[1-5]$/.test(trimmed)) {
    throw new Error(
      `Invalid overall rating at CCN ${ccn}: "${value}"`,
    );
  }

  return Number.parseInt(trimmed, 10);
}

async function main() {
  const writeMode = process.argv.includes("--write");

  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CMS CSV not found: ${CSV_PATH}`);
  }

  const csvText = fs.readFileSync(CSV_PATH, "utf8");

  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  }) as CsvRow[];

  if (rows.length === 0) {
    throw new Error("CMS CSV contains no data rows.");
  }

  const headers = Object.keys(rows[0]);

  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header),
  );

  if (missingHeaders.length > 0) {
    throw new Error(
      `Missing required CMS headers: ${missingHeaders.join(", ")}`,
    );
  }

  const seenCcns = new Set<string>();
  const parsedRows = [];

  let invalidCcns = 0;
  let duplicateCcns = 0;
  let invalidRows = 0;
  let ratedHospitals = 0;
  let unratedHospitals = 0;

  for (const row of rows) {
    const ccn = row["Facility ID"].trim();

    if (!/^[A-Z0-9]{6}$/.test(ccn)) {
      invalidCcns++;
      continue;
    }

    if (seenCcns.has(ccn)) {
      duplicateCcns++;
      continue;
    }

    seenCcns.add(ccn);

    try {
      const overallRating = parseOverallRating(
        row["Hospital overall rating"],
        ccn,
      );

      if (overallRating === null) {
        unratedHospitals++;
      } else {
        ratedHospitals++;
      }

      const footnote =
        row["Hospital overall rating footnote"].trim();

      parsedRows.push({
        hospitalCcn: ccn,
        overallRating,
        overallRatingFootnote:
          footnote.length > 0 ? footnote : null,

        mortalityMeasureCount: parseNullableInteger(
          row["Count of Facility MORT Measures"],
          "Count of Facility MORT Measures",
          ccn,
        ),
        mortalityBetter: parseNullableInteger(
          row["Count of MORT Measures Better"],
          "Count of MORT Measures Better",
          ccn,
        ),
        mortalitySame: parseNullableInteger(
          row["Count of MORT Measures No Different"],
          "Count of MORT Measures No Different",
          ccn,
        ),
        mortalityWorse: parseNullableInteger(
          row["Count of MORT Measures Worse"],
          "Count of MORT Measures Worse",
          ccn,
        ),

        safetyMeasureCount: parseNullableInteger(
          row["Count of Facility Safety Measures"],
          "Count of Facility Safety Measures",
          ccn,
        ),
        safetyBetter: parseNullableInteger(
          row["Count of Safety Measures Better"],
          "Count of Safety Measures Better",
          ccn,
        ),
        safetySame: parseNullableInteger(
          row["Count of Safety Measures No Different"],
          "Count of Safety Measures No Different",
          ccn,
        ),
        safetyWorse: parseNullableInteger(
          row["Count of Safety Measures Worse"],
          "Count of Safety Measures Worse",
          ccn,
        ),

        readmissionMeasureCount: parseNullableInteger(
          row["Count of Facility READM Measures"],
          "Count of Facility READM Measures",
          ccn,
        ),
        readmissionBetter: parseNullableInteger(
          row["Count of READM Measures Better"],
          "Count of READM Measures Better",
          ccn,
        ),
        readmissionSame: parseNullableInteger(
          row["Count of READM Measures No Different"],
          "Count of READM Measures No Different",
          ccn,
        ),
        readmissionWorse: parseNullableInteger(
          row["Count of READM Measures Worse"],
          "Count of READM Measures Worse",
          ccn,
        ),

        patientExperienceMeasureCount: parseNullableInteger(
          row["Count of Facility Pt Exp Measures"],
          "Count of Facility Pt Exp Measures",
          ccn,
        ),

        sourceDataset: SOURCE_DATASET,
        sourceUrl: SOURCE_URL,
        releaseDate: RELEASE_DATE,
      });
    } catch (error) {
      invalidRows++;

      console.error(
        error instanceof Error ? error.message : error,
      );
    }
  }

  const hospitalCcns = await prisma.hospital.findMany({
    select: { ccn: true },
  });

  const existingCcns = new Set(
    hospitalCcns.map((hospital) => hospital.ccn),
  );

  const missingHospitals = parsedRows.filter(
    (row) => !existingCcns.has(row.hospitalCcn),
  );

  console.log("");
  console.log("CMS quality import validation");
  console.log("-----------------------------");
  console.log(`CSV rows:              ${rows.length}`);
  console.log(`Parsed rows:           ${parsedRows.length}`);
  console.log(`Invalid CCNs:          ${invalidCcns}`);
  console.log(`Duplicate CCNs:        ${duplicateCcns}`);
  console.log(`Invalid quality rows:  ${invalidRows}`);
  console.log(`Rated hospitals:       ${ratedHospitals}`);
  console.log(`Unrated hospitals:     ${unratedHospitals}`);
  console.log(`Missing hospital CCNs: ${missingHospitals.length}`);
  console.log(`Mode:                  ${writeMode ? "WRITE" : "DRY RUN"}`);
  console.log("");

  if (
    invalidCcns > 0 ||
    duplicateCcns > 0 ||
    invalidRows > 0 ||
    missingHospitals.length > 0
  ) {
    throw new Error(
      "Validation failed. Database was not modified.",
    );
  }

  if (!writeMode) {
    console.log("Validation succeeded.");
    console.log("No database changes were made.");
    console.log("Run again with --write to import.");
    return;
  }

  let created = 0;
  let updated = 0;

  for (const row of parsedRows) {
    const existing = await prisma.cmsQualitySnapshot.findUnique({
      where: {
        hospitalCcn_releaseDate: {
          hospitalCcn: row.hospitalCcn,
          releaseDate: row.releaseDate,
        },
      },
      select: { id: true },
    });

    await prisma.cmsQualitySnapshot.upsert({
      where: {
        hospitalCcn_releaseDate: {
          hospitalCcn: row.hospitalCcn,
          releaseDate: row.releaseDate,
        },
      },
      create: row,
      update: {
        overallRating: row.overallRating,
        overallRatingFootnote: row.overallRatingFootnote,
        mortalityMeasureCount: row.mortalityMeasureCount,
        mortalityBetter: row.mortalityBetter,
        mortalitySame: row.mortalitySame,
        mortalityWorse: row.mortalityWorse,
        safetyMeasureCount: row.safetyMeasureCount,
        safetyBetter: row.safetyBetter,
        safetySame: row.safetySame,
        safetyWorse: row.safetyWorse,
        readmissionMeasureCount: row.readmissionMeasureCount,
        readmissionBetter: row.readmissionBetter,
        readmissionSame: row.readmissionSame,
        readmissionWorse: row.readmissionWorse,
        patientExperienceMeasureCount:
          row.patientExperienceMeasureCount,
        sourceDataset: row.sourceDataset,
        sourceUrl: row.sourceUrl,
      },
    });

    if (existing) {
      updated++;
    } else {
      created++;
    }
  }

  console.log("CMS quality import complete.");
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });