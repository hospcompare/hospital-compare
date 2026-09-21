/**
 * Import normalized local profession pay benchmarks into LocalPayBenchmark.
 *
 * Dry-run is the default. This script does not download external data.
 * It reads a normalized CSV, validates every row, resolves profession slugs
 * to active Profession records, and prints an insert/update plan.
 * Pass --write to upsert only after that plan has no validation failures.
 *
 * Write policy matches the CMS importers (scripts/import-cms-hospitals.ts and
 * scripts/import-cms-quality.ts): any validation failure blocks the entire
 * import. Valid rows are not partially written. Dry-run performs reads only.
 *
 * Normalized CSV columns (header required; column order does not matter):
 *   professionSlug
 *   geographicAreaCode
 *   geographicAreaName
 *   geographicLevel
 *   hourlyMean
 *   hourlyMedian
 *   annualMean
 *   annualMedian
 *   source
 *   sourceDataset
 *   sourceUrl
 *   effectiveDate
 *
 * professionSlug is the only profession key. A professionId / profession_id
 * column is rejected. Wage cells may be empty (stored as null) or a
 * non-negative decimal. At least one wage cell is required. Hourly values
 * must fit Decimal(8,2) and annual values must fit Decimal(12,2) exactly
 * (no rounding, no wage-market caps). effectiveDate, when present, must be
 * a real calendar date in YYYY-MM-DD form. sourceUrl, when present, must
 * be an absolute http or https URL.
 *
 * Logical identity, matching the LocalPayBenchmark unique key:
 *   profession + geographicAreaCode + geographicLevel + source + sourceDataset
 *
 * The same sourceDataset updates the existing row. A different sourceDataset
 * inserts a separate historical row. effectiveDate is metadata and is not
 * part of the identity. Duplicate identities in one file fail validation.
 *
 * Usage:
 *   npx tsx scripts/import-local-pay-benchmarks.ts --file data/fixtures/local-pay-benchmarks.sample.csv
 *   npx tsx scripts/import-local-pay-benchmarks.ts --file path/to/normalized.csv --write
 *
 * data/fixtures/local-pay-benchmarks.sample.csv is a fake documentation
 * fixture, not a wage dataset.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const REQUIRED_HEADERS = [
  "professionSlug",
  "geographicAreaCode",
  "geographicAreaName",
  "geographicLevel",
  "hourlyMean",
  "hourlyMedian",
  "annualMean",
  "annualMedian",
  "source",
  "sourceDataset",
  "sourceUrl",
  "effectiveDate",
] as const;

const SAMPLE_ERROR_LIMIT = 20;
const WAGE_SCALE = 2;
const HOURLY_INTEGER_DIGITS = 6;
const ANNUAL_INTEGER_DIGITS = 10;

type CsvRow = Record<string, string | undefined>;

type FieldResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

type CandidateRow = {
  dataRow: number;
  professionSlug: string;
  geographicAreaCode: string;
  geographicAreaName: string;
  geographicLevel: string;
  hourlyMean: string | null;
  hourlyMedian: string | null;
  annualMean: string | null;
  annualMedian: string | null;
  source: string;
  sourceDataset: string;
  sourceUrl: string | null;
  effectiveDate: Date | null;
  errors: string[];
  unknownOrInactiveProfession: boolean;
  professionId: string | null;
};

type PlanRow = CandidateRow & { professionId: string };

const prismaHolder: { client: PrismaClient | null } = { client: null };

function printHelp() {
  console.log(
    [
      "Usage: npx tsx scripts/import-local-pay-benchmarks.ts --file <normalized.csv> [--write]",
      "",
      "Default mode is dry-run. --write upserts only when every row is valid.",
      "See the script header for the normalized CSV columns.",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]) {
  let write = false;
  let filePath: string | undefined;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];

    if (arg === "--write") {
      write = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--file") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing path after --file.");
      }
      filePath = value;
      index++;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!filePath) {
    throw new Error(
      "Missing required --file <path>. Dry-run example: npx tsx scripts/import-local-pay-benchmarks.ts --file data/fixtures/local-pay-benchmarks.sample.csv",
    );
  }

  return {
    write,
    filePath: path.resolve(process.cwd(), filePath),
  };
}

function cell(row: CsvRow, header: string) {
  return String(row[header] ?? "");
}

function displayValue(value: string) {
  const compact =
    value.length > 120 ? `${value.slice(0, 117)}...` : value;
  return JSON.stringify(compact);
}

function requireText(raw: string, fieldName: string): FieldResult<string> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: `${fieldName} is required` };
  }
  return { ok: true, value: trimmed };
}

function parseWage(
  raw: string,
  fieldName: string,
  integerDigits: number,
  decimalLabel: string,
): FieldResult<string | null> {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }

  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    return {
      ok: false,
      error: `${fieldName} must be a non-negative decimal number or empty`,
    };
  }

  const whole = match[1].replace(/^0+(?=\d)/, "");
  const fraction = match[2] ?? "";
  const significantFraction = fraction.replace(/0+$/, "");

  if (significantFraction.length > WAGE_SCALE) {
    return {
      ok: false,
      error: `${fieldName} has more than ${WAGE_SCALE} decimal places and does not fit ${decimalLabel} without rounding`,
    };
  }

  if (whole.length > integerDigits) {
    return {
      ok: false,
      error: `${fieldName} exceeds ${decimalLabel} storage bounds`,
    };
  }

  const paddedFraction = `${fraction}${"0".repeat(WAGE_SCALE)}`.slice(
    0,
    WAGE_SCALE,
  );

  return { ok: true, value: `${whole}.${paddedFraction}` };
}

function daysInGregorianMonth(year: number, month: number) {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return days[month - 1];
}

function parseEffectiveDate(raw: string): FieldResult<Date | null> {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return {
      ok: false,
      error: `effectiveDate must be a calendar date YYYY-MM-DD: ${displayValue(trimmed)}`,
    };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) {
    return {
      ok: false,
      error: `effectiveDate is not a valid calendar date: ${displayValue(trimmed)}`,
    };
  }

  const monthLength = daysInGregorianMonth(year, month);
  if (day < 1 || day > monthLength) {
    return {
      ok: false,
      error: `effectiveDate is not a valid calendar date: ${displayValue(trimmed)}`,
    };
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return {
      ok: false,
      error: `effectiveDate is not a valid calendar date: ${displayValue(trimmed)}`,
    };
  }

  return { ok: true, value: parsed };
}

function parseSourceUrl(raw: string): FieldResult<string | null> {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: `sourceUrl must be an absolute http or https URL: ${displayValue(trimmed)}`,
    };
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.hostname === ""
  ) {
    return {
      ok: false,
      error: `sourceUrl must be an absolute http or https URL: ${displayValue(trimmed)}`,
    };
  }

  return { ok: true, value: trimmed };
}

function takeText(
  row: CsvRow,
  header: string,
  errors: string[],
) {
  const result = requireText(cell(row, header), header);
  if (!result.ok) {
    errors.push(result.error);
    return "";
  }
  return result.value;
}

function takeWage(
  row: CsvRow,
  header: string,
  integerDigits: number,
  decimalLabel: string,
  errors: string[],
) {
  const result = parseWage(
    cell(row, header),
    header,
    integerDigits,
    decimalLabel,
  );
  if (!result.ok) {
    errors.push(result.error);
    return null;
  }
  return result.value;
}

function parseCandidate(row: CsvRow, dataRow: number): CandidateRow {
  const errors: string[] = [];
  const professionSlug = takeText(row, "professionSlug", errors);
  const geographicAreaCode = takeText(row, "geographicAreaCode", errors);
  const geographicAreaName = takeText(row, "geographicAreaName", errors);
  const geographicLevel = takeText(row, "geographicLevel", errors);
  const hourlyMean = takeWage(
    row,
    "hourlyMean",
    HOURLY_INTEGER_DIGITS,
    "Decimal(8,2)",
    errors,
  );
  const hourlyMedian = takeWage(
    row,
    "hourlyMedian",
    HOURLY_INTEGER_DIGITS,
    "Decimal(8,2)",
    errors,
  );
  const annualMean = takeWage(
    row,
    "annualMean",
    ANNUAL_INTEGER_DIGITS,
    "Decimal(12,2)",
    errors,
  );
  const annualMedian = takeWage(
    row,
    "annualMedian",
    ANNUAL_INTEGER_DIGITS,
    "Decimal(12,2)",
    errors,
  );
  const source = takeText(row, "source", errors);
  const sourceDataset = takeText(row, "sourceDataset", errors);

  const sourceUrlResult = parseSourceUrl(cell(row, "sourceUrl"));
  const sourceUrl = sourceUrlResult.ok ? sourceUrlResult.value : null;
  if (!sourceUrlResult.ok) {
    errors.push(sourceUrlResult.error);
  }

  const effectiveDateResult = parseEffectiveDate(cell(row, "effectiveDate"));
  const effectiveDate = effectiveDateResult.ok
    ? effectiveDateResult.value
    : null;
  if (!effectiveDateResult.ok) {
    errors.push(effectiveDateResult.error);
  }

  const wages = [hourlyMean, hourlyMedian, annualMean, annualMedian];
  if (wages.every((wage) => wage === null)) {
    const wageHeaders = [
      "hourlyMean",
      "hourlyMedian",
      "annualMean",
      "annualMedian",
    ];
    const wageCellsInvalid = wageHeaders.some((header) =>
      errors.some((error) => error.startsWith(`${header} `)),
    );
    if (!wageCellsInvalid) {
      errors.push("at least one wage field is required");
    }
  }

  return {
    dataRow,
    professionSlug,
    geographicAreaCode,
    geographicAreaName,
    geographicLevel,
    hourlyMean,
    hourlyMedian,
    annualMean,
    annualMedian,
    source,
    sourceDataset,
    sourceUrl,
    effectiveDate,
    errors,
    unknownOrInactiveProfession: false,
    professionId: null,
  };
}

function identityKey(row: CandidateRow) {
  if (
    !row.professionSlug ||
    !row.geographicAreaCode ||
    !row.geographicLevel ||
    !row.source ||
    !row.sourceDataset
  ) {
    return null;
  }

  return JSON.stringify([
    row.professionSlug,
    row.geographicAreaCode,
    row.geographicLevel,
    row.source,
    row.sourceDataset,
  ]);
}

function markDuplicateIdentities(rows: CandidateRow[]) {
  const groups = new Map<string, CandidateRow[]>();

  for (const row of rows) {
    const key = identityKey(row);
    if (!key) {
      continue;
    }
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  let duplicateLogicalIdentities = 0;

  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }

    duplicateLogicalIdentities++;
    const dataRows = group.map((row) => row.dataRow).join(", ");
    for (const row of group) {
      row.errors.push(
        `duplicate logical identity (professionSlug, geographicAreaCode, geographicLevel, source, sourceDataset) on data rows ${dataRows}`,
      );
    }
  }

  return duplicateLogicalIdentities;
}

function databaseIdentity(row: {
  professionId: string;
  geographicAreaCode: string;
  geographicLevel: string;
  source: string;
  sourceDataset: string;
}) {
  return JSON.stringify([
    row.professionId,
    row.geographicAreaCode,
    row.geographicLevel,
    row.source,
    row.sourceDataset,
  ]);
}

async function resolveProfessions(
  prisma: PrismaClient,
  rows: CandidateRow[],
) {
  const slugs = [
    ...new Set(
      rows
        .map((row) => row.professionSlug)
        .filter((slug) => slug.length > 0),
    ),
  ];

  if (slugs.length === 0) {
    return;
  }

  const professions = await prisma.profession.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, active: true },
  });

  const bySlug = new Map(
    professions.map((profession) => [profession.slug, profession]),
  );

  for (const row of rows) {
    if (!row.professionSlug) {
      continue;
    }

    const profession = bySlug.get(row.professionSlug);
    if (!profession || !profession.active) {
      row.unknownOrInactiveProfession = true;
      row.errors.push(
        `unknown or inactive profession slug: ${displayValue(row.professionSlug)}`,
      );
      continue;
    }

    row.professionId = profession.id;
  }
}

async function planWrites(prisma: PrismaClient, rows: PlanRow[]) {
  const existingKeys = new Set<string>();
  const groups = new Map<string, PlanRow[]>();

  for (const row of rows) {
    const groupKey = JSON.stringify([row.source, row.sourceDataset]);
    const group = groups.get(groupKey);
    if (group) {
      group.push(row);
    } else {
      groups.set(groupKey, [row]);
    }
  }

  for (const groupRows of groups.values()) {
    const source = groupRows[0].source;
    const sourceDataset = groupRows[0].sourceDataset;
    const existing = await prisma.localPayBenchmark.findMany({
      where: {
        source,
        sourceDataset,
        professionId: {
          in: [...new Set(groupRows.map((row) => row.professionId))],
        },
        geographicAreaCode: {
          in: [...new Set(groupRows.map((row) => row.geographicAreaCode))],
        },
      },
      select: {
        professionId: true,
        geographicAreaCode: true,
        geographicLevel: true,
        source: true,
        sourceDataset: true,
      },
    });

    for (const row of existing) {
      existingKeys.add(databaseIdentity(row));
    }
  }

  let wouldInsert = 0;
  let wouldUpdate = 0;

  for (const row of rows) {
    if (existingKeys.has(databaseIdentity(row))) {
      wouldUpdate++;
    } else {
      wouldInsert++;
    }
  }

  return { wouldInsert, wouldUpdate };
}

function isPlanRow(row: CandidateRow): row is PlanRow {
  return row.errors.length === 0 && row.professionId !== null;
}

function benchmarkData(row: PlanRow) {
  return {
    geographicAreaName: row.geographicAreaName,
    hourlyMean: row.hourlyMean,
    hourlyMedian: row.hourlyMedian,
    annualMean: row.annualMean,
    annualMedian: row.annualMedian,
    sourceUrl: row.sourceUrl,
    effectiveDate: row.effectiveDate,
  };
}

async function writePlan(prisma: PrismaClient, rows: PlanRow[]) {
  let created = 0;
  let updated = 0;

  await prisma.$transaction(
    async (tx) => {
      for (const row of rows) {
        const where = {
          professionId_geographicAreaCode_geographicLevel_source_sourceDataset:
            {
              professionId: row.professionId,
              geographicAreaCode: row.geographicAreaCode,
              geographicLevel: row.geographicLevel,
              source: row.source,
              sourceDataset: row.sourceDataset,
            },
        };

        const existing = await tx.localPayBenchmark.findUnique({
          where,
          select: { id: true },
        });

        const data = benchmarkData(row);

        await tx.localPayBenchmark.upsert({
          where,
          create: {
            professionId: row.professionId,
            geographicAreaCode: row.geographicAreaCode,
            geographicLevel: row.geographicLevel,
            source: row.source,
            sourceDataset: row.sourceDataset,
            ...data,
          },
          update: data,
        });

        if (existing) {
          updated++;
        } else {
          created++;
        }
      }
    },
    { maxWait: 10_000, timeout: 120_000 },
  );

  return { created, updated };
}

function printSummary(input: {
  filePath: string;
  write: boolean;
  total: number;
  valid: number;
  invalid: number;
  unknownOrInactive: number;
  duplicateLogicalIdentities: number;
  wouldInsert: number;
  wouldUpdate: number;
  errors: { dataRow: number; message: string }[];
}) {
  console.log("");
  console.log("======================================");
  console.log(
    input.write
      ? " Local Pay Benchmark Import - WRITE MODE"
      : " Local Pay Benchmark Import - DRY RUN",
  );
  console.log("======================================");
  console.log(`Source: ${input.filePath}`);
  console.log("Format: normalized local pay benchmark CSV");
  console.log("");
  console.log(`Total input rows:                  ${input.total}`);
  console.log(`Valid rows:                        ${input.valid}`);
  console.log(`Invalid rows:                      ${input.invalid}`);
  console.log(
    `Unknown or inactive professions:   ${input.unknownOrInactive}`,
  );
  console.log(
    `Duplicate logical identities:      ${input.duplicateLogicalIdentities}`,
  );
  console.log(`Rows that would insert:            ${input.wouldInsert}`);
  console.log(`Rows that would update:            ${input.wouldUpdate}`);

  if (input.errors.length > 0) {
    console.log("");
    console.log("Sample validation errors:");
    for (const error of input.errors.slice(0, SAMPLE_ERROR_LIMIT)) {
      console.log(`- data row ${error.dataRow}: ${error.message}`);
    }
    if (input.errors.length > SAMPLE_ERROR_LIMIT) {
      console.log(
        `... ${input.errors.length - SAMPLE_ERROR_LIMIT} more validation errors`,
      );
    }
  }

  console.log("");
}

async function main() {
  const { write, filePath } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(filePath)) {
    throw new Error(`Local pay benchmark CSV not found: ${filePath}`);
  }

  const csvText = fs.readFileSync(filePath, "utf8");
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  }) as CsvRow[];

  if (rows.length === 0) {
    throw new Error("Local pay benchmark CSV contains no data rows.");
  }

  const headers = Object.keys(rows[0]);
  const forbiddenHeaders = headers.filter((header) =>
    /^(profession[\s_-]?id)$/i.test(header.trim()),
  );

  if (forbiddenHeaders.length > 0) {
    throw new Error(
      `Source files must identify professions by professionSlug. Rejected id column(s): ${forbiddenHeaders.join(", ")}`,
    );
  }

  const missingHeaders = REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header),
  );

  if (missingHeaders.length > 0) {
    throw new Error(
      `Missing required columns: ${missingHeaders.join(", ")}`,
    );
  }

  const candidates = rows.map((row, index) => parseCandidate(row, index + 1));
  const duplicateLogicalIdentities = markDuplicateIdentities(candidates);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  prismaHolder.client = prisma;

  await resolveProfessions(prisma, candidates);

  const planRows = candidates.filter(isPlanRow);
  const { wouldInsert, wouldUpdate } = await planWrites(prisma, planRows);

  const errors = candidates.flatMap((row) =>
    row.errors.map((message) => ({ dataRow: row.dataRow, message })),
  );
  const invalid = candidates.filter((row) => row.errors.length > 0).length;
  const unknownOrInactive = candidates.filter(
    (row) => row.unknownOrInactiveProfession,
  ).length;

  printSummary({
    filePath,
    write,
    total: candidates.length,
    valid: planRows.length,
    invalid,
    unknownOrInactive,
    duplicateLogicalIdentities,
    wouldInsert,
    wouldUpdate,
    errors,
  });

  if (invalid > 0) {
    throw new Error(
      "Validation failed. Database was not modified. Valid rows were not partially written.",
    );
  }

  if (!write) {
    console.log("DRY RUN COMPLETE.");
    console.log("No database records were inserted, updated, or deleted.");
    console.log("Use --write only after validation has been reviewed.");
    return;
  }

  console.log("Connecting to PostgreSQL...");
  console.log("Beginning local pay benchmark upsert...");

  const { created, updated } = await writePlan(prisma, planRows);

  console.log("");
  console.log("======================================");
  console.log(" LOCAL PAY BENCHMARK IMPORT COMPLETE");
  console.log("======================================");
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log("Rows outside this import plan were not deleted.");
}

main()
  .catch((error) => {
    console.error("");
    console.error("LOCAL PAY BENCHMARK IMPORT FAILED:");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaHolder.client?.$disconnect();
  });
