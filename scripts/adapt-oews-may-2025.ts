/**
 * Convert the official BLS OEWS May 2025 metropolitan and nonmetropolitan
 * area estimates into the normalized LocalPayBenchmark CSV.
 *
 * Read-only. This script downloads or reads a local copy of the official
 * archive and writes a CSV. It does not use Prisma, PostgreSQL, or the
 * benchmark importer's --write path.
 *
 * Official source:
 *   https://www.bls.gov/oes/special-requests/oesm25ma.zip
 *     MSA_M2025_dl.xlsx  Metropolitan Statistical Area (AREA_TYPE 4)
 *     BOS_M2025_dl.xlsx  Nonmetropolitan Area (AREA_TYPE 6)
 *
 * First occupation only:
 *   occ_code 29-1141 Registered Nurses -> professionSlug registered-nurse
 *
 * Output columns match scripts/import-local-pay-benchmarks.ts.
 * source = BLS OEWS
 * sourceDataset = OEWS-2025-MAY
 * effectiveDate = 2025-05-01
 *
 * Official markers *, #, **, and blank wage cells become empty CSV cells
 * (null on import), never zero. A row whose four wage cells are all
 * unpublished is omitted: the importer requires at least one wage.
 * Duplicate profession/area/level/source/dataset identities abort the run
 * and do not overwrite one another.
 *
 * Usage:
 *   npx tsx scripts/adapt-oews-may-2025.ts
 *   npx tsx scripts/adapt-oews-may-2025.ts --input /path/to/oesm25ma.zip
 *   npx tsx scripts/adapt-oews-may-2025.ts --output data/generated/oews-2025-may-registered-nurse.csv
 */
import fs from "node:fs";
import path from "node:path";
import {
  adaptOewsMay2025Zip,
  formatAdaptReport,
} from "./oews/may-2025/adapt";
import { OEWS_MAY_2025_SOURCE_URL } from "./oews/may-2025/constants";
import { writeBenchmarkCsv } from "./oews/may-2025/csv";
import { OewsAdapterError } from "./oews/may-2025/errors";

const DEFAULT_OUTPUT = path.join(
  "data",
  "generated",
  "oews-2025-may-registered-nurse.csv",
);

function printHelp() {
  console.log(
    [
      "Usage: npx tsx scripts/adapt-oews-may-2025.ts [--input <oesm25ma.zip>] [--output <csv>]",
      "",
      "Default --output is data/generated/oews-2025-may-registered-nurse.csv.",
      "Without --input, the official May 2025 metropolitan/nonmetropolitan ZIP is downloaded.",
      "This command does not write to the database.",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]) {
  let inputPath: string | undefined;
  let outputPath = DEFAULT_OUTPUT;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--input" || arg === "--output") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new OewsAdapterError(`Missing path after ${arg}.`);
      }
      if (arg === "--input") {
        inputPath = value;
      } else {
        outputPath = value;
      }
      index++;
      continue;
    }
    throw new OewsAdapterError(`Unknown argument: ${arg}`);
  }

  return {
    inputPath: inputPath
      ? path.resolve(process.cwd(), inputPath)
      : undefined,
    outputPath: path.resolve(process.cwd(), outputPath),
  };
}

async function downloadOfficialZip() {
  const response = await fetch(OEWS_MAY_2025_SOURCE_URL, {
    headers: {
      Accept: "application/zip, application/octet-stream, */*",
      "User-Agent": "hospital-compare-oews-adapter",
    },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new OewsAdapterError(
      `Failed to download ${OEWS_MAY_2025_SOURCE_URL}: HTTP ${response.status}. Pass --input with the official oesm25ma.zip.`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new OewsAdapterError(
      `Download from ${OEWS_MAY_2025_SOURCE_URL} is not a ZIP file.`,
    );
  }
  return bytes;
}

async function main() {
  const { inputPath, outputPath } = parseArgs(process.argv.slice(2));
  let zipBytes: Uint8Array;
  if (inputPath) {
    if (!fs.existsSync(inputPath)) {
      throw new OewsAdapterError(`OEWS archive not found: ${inputPath}`);
    }
    zipBytes = new Uint8Array(fs.readFileSync(inputPath));
  } else {
    zipBytes = await downloadOfficialZip();
  }

  const { rows, report } = adaptOewsMay2025Zip(zipBytes);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, writeBenchmarkCsv(rows));

  console.log(formatAdaptReport(report));
  console.log("");
  console.log(`Wrote ${rows.length} rows to ${outputPath}`);
  console.log("No database records were inserted, updated, or deleted.");
}

main().catch((error) => {
  console.error("");
  console.error("OEWS MAY 2025 ADAPTER FAILED:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
