import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

type CmsHospitalRow = {
  "Facility ID": string;
  "Facility Name": string;
  Address: string;
  "City/Town": string;
  State: string;
  "ZIP Code": string;
  "County/Parish": string;
  "Hospital Type": string;
  "Hospital Ownership": string;
};

const WRITE_MODE = process.argv.includes("--write");

const csvPath = path.resolve(
  process.cwd(),
  "data",
  "Hospital_General_Information.csv",
);

if (!fs.existsSync(csvPath)) {
  throw new Error(`CMS CSV not found: ${csvPath}`);
}

const csv = fs.readFileSync(csvPath, "utf8");

const rows = parse(csv, {
  columns: true,
  skip_empty_lines: true,
  bom: true,
  trim: true,
}) as CmsHospitalRow[];

const requiredHeaders = [
  "Facility ID",
  "Facility Name",
  "Address",
  "City/Town",
  "State",
  "ZIP Code",
  "County/Parish",
  "Hospital Type",
  "Hospital Ownership",
];

if (rows.length === 0) {
  throw new Error("CMS CSV contains no hospital rows.");
}

for (const header of requiredHeaders) {
  if (!(header in rows[0])) {
    throw new Error(`Required CMS column is missing: ${header}`);
  }
}

const validCcnPattern = /^[A-Z0-9]{6}$/;

let invalidCcnCount = 0;
let missingNameCount = 0;
let missingAddressCount = 0;

const ccnCounts = new Map<string, number>();

for (const row of rows) {
  const ccn = String(row["Facility ID"] ?? "").trim();
  const name = String(row["Facility Name"] ?? "").trim();
  const address = String(row.Address ?? "").trim();

  if (!validCcnPattern.test(ccn)) {
    invalidCcnCount++;
  }

  if (!name) {
    missingNameCount++;
  }

  if (!address) {
    missingAddressCount++;
  }

  ccnCounts.set(ccn, (ccnCounts.get(ccn) ?? 0) + 1);
}

const duplicates = [...ccnCounts.entries()].filter(
  ([, count]) => count > 1,
);

const validationFailed =
  invalidCcnCount > 0 ||
  missingNameCount > 0 ||
  missingAddressCount > 0 ||
  duplicates.length > 0;

console.log("");
console.log("======================================");
console.log(
  WRITE_MODE
    ? " CMS Hospital Import - WRITE MODE"
    : " CMS Hospital Import - DRY RUN",
);
console.log("======================================");
console.log(`Source: ${csvPath}`);
console.log("");
console.log(`Total CSV rows:        ${rows.length}`);
console.log(`Invalid CCNs:          ${invalidCcnCount}`);
console.log(`Missing names:         ${missingNameCount}`);
console.log(`Missing addresses:     ${missingAddressCount}`);
console.log(`Duplicate CCNs:        ${duplicates.length}`);

if (validationFailed) {
  throw new Error(
    "CMS validation failed. Database import has been blocked.",
  );
}

console.log("");
console.log(`Validated ${rows.length} CMS hospital records successfully.`);

if (!WRITE_MODE) {
  console.log("");
  console.log("DRY RUN COMPLETE.");
  console.log("No database records were inserted, updated, or deleted.");
  console.log("Use --write only after validation has been reviewed.");
  process.exit(0);
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function importHospitals() {
  let created = 0;
  let updated = 0;

  console.log("");
  console.log("Connecting to PostgreSQL...");
  console.log("Beginning CMS hospital upsert...");
  console.log("");

  try {
    for (const [index, row] of rows.entries()) {
      const ccn = String(row["Facility ID"]).trim();

      const data = {
        name: String(row["Facility Name"]).trim(),
        address: String(row.Address).trim(),
        city: String(row["City/Town"]).trim(),
        state: String(row.State).trim(),
        zip: String(row["ZIP Code"]).trim(),
        county: String(row["County/Parish"] ?? "").trim() || null,
        hospitalType:
          String(row["Hospital Type"] ?? "").trim() || null,
        ownership:
          String(row["Hospital Ownership"] ?? "").trim() || null,
        isSeed: false,
      };

      const existing = await prisma.hospital.findUnique({
        where: { ccn },
        select: { ccn: true },
      });

      if (existing) {
        await prisma.hospital.update({
          where: { ccn },
          data,
        });

        updated++;
      } else {
        await prisma.hospital.create({
          data: {
            ccn,
            ...data,
          },
        });

        created++;
      }

      if ((index + 1) % 500 === 0) {
        console.log(
          `Processed ${index + 1} / ${rows.length} hospitals...`,
        );
      }
    }

    const totalHospitals = await prisma.hospital.count();
    const cmsHospitals = await prisma.hospital.count({
      where: { isSeed: false },
    });
    const seedHospitals = await prisma.hospital.count({
      where: { isSeed: true },
    });

    console.log("");
    console.log("======================================");
    console.log(" CMS IMPORT COMPLETE");
    console.log("======================================");
    console.log(`Created:              ${created}`);
    console.log(`Updated:              ${updated}`);
    console.log(`CMS hospitals:        ${cmsHospitals}`);
    console.log(`Sample hospitals:     ${seedHospitals}`);
    console.log(`Total hospital rows:  ${totalHospitals}`);
    console.log("");
    console.log("Sample hospitals have NOT been deleted.");
  } finally {
    await prisma.$disconnect();
  }
}

importHospitals().catch((error) => {
  console.error("");
  console.error("CMS IMPORT FAILED:");
  console.error(error);
  process.exitCode = 1;
});