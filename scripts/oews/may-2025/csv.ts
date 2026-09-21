import {
  NORMALIZED_BENCHMARK_COLUMNS,
  type NormalizedBenchmarkColumn,
} from "./constants";

export type NormalizedBenchmarkRow = Record<
  NormalizedBenchmarkColumn,
  string | null
>;

export function csvField(value: string) {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function writeBenchmarkCsv(rows: readonly NormalizedBenchmarkRow[]) {
  const lines = [NORMALIZED_BENCHMARK_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(
      NORMALIZED_BENCHMARK_COLUMNS.map((column) =>
        csvField(row[column] ?? ""),
      ).join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
