/**
 * Production-safe database seed.
 *
 * Hospital records are populated from authoritative source importers
 * (for example, scripts/import-cms-hospitals.ts), not from Prisma seed data.
 *
 * This file intentionally does not create sample hospitals, salaries,
 * reviews, hospital facts, or cost-of-living records.
 *
 * Future static/reference data may be added here if appropriate.
 */

async function main() {
  console.log("No seed data to apply.");
  console.log(
    "Hospital data is managed by the CMS import pipeline, not prisma db seed.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});