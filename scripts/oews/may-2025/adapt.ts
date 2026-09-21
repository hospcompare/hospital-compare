import {
  OEWS_CROSS_INDUSTRY_GROUP,
  OEWS_CROSS_INDUSTRY_NAICS,
  OEWS_CROSS_OWNERSHIP_CODE,
  OEWS_MAY_2025_DATASET,
  OEWS_MAY_2025_EFFECTIVE_DATE,
  OEWS_MAY_2025_SOURCE,
  OEWS_MAY_2025_SOURCE_URL,
  OEWS_MAY_2025_WORKBOOKS,
  REQUIRED_OEWS_COLUMNS,
  WAGE_COLUMNS,
  occupationForCode,
  type OewsMay2025Workbook,
  type WageField,
} from "./constants";
import type { NormalizedBenchmarkRow } from "./csv";
import { OewsAdapterError } from "./errors";
import { forEachDataSheetRow, readZipEntries } from "./read-xlsx";
import { parseWageCell, wageValue, type ParsedWage } from "./wages";

export type OewsAdaptReport = {
  sourceUrl: string;
  sourceFiles: string[];
  totalSourceRowsRead: number;
  rnRowsFound: number;
  normalizedRowsProduced: number;
  metropolitanCount: number;
  nonmetropolitanCount: number;
  skipped: {
    notConfiguredOccupation: number;
    notCrossIndustryCrossOwnership: number;
    allWagesUnpublished: number;
  };
  unpublishedWageCells: Record<WageField, number>;
  unpublishedByMarker: {
    blank: number;
    unavailable: number;
    topCoded: number;
    employmentUnavailable: number;
  };
  duplicateGeographyIdentities: number;
  skippedUnpublishedAreas: {
    workbook: string;
    excelRow: number;
    geographicAreaCode: string;
    geographicAreaName: string;
    geographicLevel: string;
  }[];
};

type InScopeRow = {
  workbook: string;
  excelRow: number;
  professionSlug: string;
  geographicAreaCode: string;
  geographicAreaName: string;
  geographicLevel: string;
  wages: Record<WageField, ParsedWage>;
};

function emptyMarkerCounts(): OewsAdaptReport["unpublishedByMarker"] {
  return {
    blank: 0,
    unavailable: 0,
    topCoded: 0,
    employmentUnavailable: 0,
  };
}

function emptyWageCounts(): Record<WageField, number> {
  return {
    hourlyMean: 0,
    hourlyMedian: 0,
    annualMean: 0,
    annualMedian: 0,
  };
}

function requireCell(
  cells: Record<string, string>,
  header: string,
  columns: Map<string, string>,
  where: string,
) {
  const letter = columns.get(header);
  if (!letter) {
    throw new OewsAdapterError(`${where} is missing column ${header}`);
  }
  return (cells[letter] ?? "").trim();
}

function headerColumns(cells: Record<string, string>) {
  const columns = new Map<string, string>();
  for (const [letter, header] of Object.entries(cells)) {
    const name = header.trim();
    if (name) {
      columns.set(name, letter);
    }
  }
  const missing = REQUIRED_OEWS_COLUMNS.filter((header) => !columns.has(header));
  if (missing.length > 0) {
    throw new OewsAdapterError(
      `OEWS data sheet is missing columns: ${missing.join(", ")}`,
    );
  }
  return columns;
}

function geographyIdentity(row: InScopeRow) {
  return [
    row.professionSlug,
    row.geographicAreaCode,
    row.geographicLevel,
    OEWS_MAY_2025_SOURCE,
    OEWS_MAY_2025_DATASET,
  ].join("\0");
}

function countUnpublished(
  wages: Record<WageField, ParsedWage>,
  cells: Record<WageField, number>,
  markers: OewsAdaptReport["unpublishedByMarker"],
) {
  for (const column of WAGE_COLUMNS) {
    const parsed = wages[column.field];
    if (parsed.kind === "value") {
      continue;
    }
    cells[column.field] += 1;
    if (parsed.kind === "blank") {
      markers.blank += 1;
    } else if (parsed.kind === "unavailable") {
      markers.unavailable += 1;
    } else if (parsed.kind === "top-coded") {
      markers.topCoded += 1;
    } else {
      markers.employmentUnavailable += 1;
    }
  }
}

function toNormalizedRow(row: InScopeRow): NormalizedBenchmarkRow {
  return {
    professionSlug: row.professionSlug,
    geographicAreaCode: row.geographicAreaCode,
    geographicAreaName: row.geographicAreaName,
    geographicLevel: row.geographicLevel,
    hourlyMean: wageValue(row.wages.hourlyMean),
    hourlyMedian: wageValue(row.wages.hourlyMedian),
    annualMean: wageValue(row.wages.annualMean),
    annualMedian: wageValue(row.wages.annualMedian),
    source: OEWS_MAY_2025_SOURCE,
    sourceDataset: OEWS_MAY_2025_DATASET,
    sourceUrl: OEWS_MAY_2025_SOURCE_URL,
    effectiveDate: OEWS_MAY_2025_EFFECTIVE_DATE,
  };
}

function readWorkbook(
  workbook: OewsMay2025Workbook,
  bytes: Uint8Array,
  state: {
    totalSourceRowsRead: number;
    rnRowsFound: number;
    skippedNotConfigured: number;
    skippedNotCrossIndustry: number;
    inScope: InScopeRow[];
  },
) {
  let columns: Map<string, string> | null = null;

  forEachDataSheetRow(bytes, workbook.fileName, (row) => {
    const columnMap = columns;
    if (!columnMap) {
      columns = headerColumns(row.cells);
      return;
    }

    state.totalSourceRowsRead += 1;
    const where = `${workbook.fileName} row ${row.excelRow}`;
    const occCode = requireCell(row.cells, "OCC_CODE", columnMap, where);
    const occupation = occupationForCode(occCode);
    if (!occupation) {
      state.skippedNotConfigured += 1;
      return;
    }

    state.rnRowsFound += 1;
    const areaType = requireCell(row.cells, "AREA_TYPE", columnMap, where);
    if (areaType !== workbook.areaType) {
      throw new OewsAdapterError(
        `${where} has AREA_TYPE ${JSON.stringify(areaType)}; ${workbook.fileName} publishes AREA_TYPE ${workbook.areaType} (${workbook.geographicLevel})`,
      );
    }

    const geographicAreaCode = requireCell(row.cells, "AREA", columnMap, where);
    const geographicAreaName = requireCell(
      row.cells,
      "AREA_TITLE",
      columnMap,
      where,
    );
    if (!geographicAreaCode || !geographicAreaName) {
      throw new OewsAdapterError(
        `${where} is missing AREA or AREA_TITLE for occupation ${occupation.occCode}`,
      );
    }

    const naics = requireCell(row.cells, "NAICS", columnMap, where);
    const industryGroup = requireCell(row.cells, "I_GROUP", columnMap, where);
    const ownership = requireCell(row.cells, "OWN_CODE", columnMap, where);
    if (
      naics !== OEWS_CROSS_INDUSTRY_NAICS ||
      industryGroup !== OEWS_CROSS_INDUSTRY_GROUP ||
      ownership !== OEWS_CROSS_OWNERSHIP_CODE
    ) {
      state.skippedNotCrossIndustry += 1;
      return;
    }

    const wages = {} as Record<WageField, ParsedWage>;
    for (const column of WAGE_COLUMNS) {
      wages[column.field] = parseWageCell(
        requireCell(row.cells, column.header, columnMap, where),
        `${where} ${column.header}`,
        column.integerDigits,
      );
    }

    state.inScope.push({
      workbook: workbook.fileName,
      excelRow: row.excelRow,
      professionSlug: occupation.professionSlug,
      geographicAreaCode,
      geographicAreaName,
      geographicLevel: workbook.geographicLevel,
      wages,
    });
  });

  if (!columns) {
    throw new OewsAdapterError(`${workbook.fileName} has no header row`);
  }
}

export function adaptOewsMay2025Zip(zipBytes: Uint8Array) {
  const entries = readZipEntries(zipBytes);
  const state = {
    totalSourceRowsRead: 0,
    rnRowsFound: 0,
    skippedNotConfigured: 0,
    skippedNotCrossIndustry: 0,
    inScope: [] as InScopeRow[],
  };

  for (const workbook of OEWS_MAY_2025_WORKBOOKS) {
    const bytes = entries.get(workbook.fileName);
    if (!bytes) {
      throw new OewsAdapterError(
        `Official OEWS archive is missing ${workbook.fileName}`,
      );
    }
    readWorkbook(workbook, bytes, state);
  }

  const groups = new Map<string, InScopeRow[]>();
  for (const row of state.inScope) {
    const key = geographyIdentity(row);
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  const duplicateGroups = [...groups.values()].filter((group) => group.length > 1);
  if (duplicateGroups.length > 0) {
    const sample = duplicateGroups
      .slice(0, 20)
      .map((group) => {
        const first = group[0];
        const locations = group
          .map((row) => `${row.workbook} row ${row.excelRow}`)
          .join("; ");
        return `${first.professionSlug} ${first.geographicAreaCode} ${first.geographicLevel} (${locations})`;
      })
      .join("\n");
    throw new OewsAdapterError(
      `Duplicate RN geography identities: ${duplicateGroups.length}. Rows were not overwritten.\n${sample}`,
    );
  }

  const unpublishedWageCells = emptyWageCounts();
  const unpublishedByMarker = emptyMarkerCounts();
  const skippedUnpublishedAreas: OewsAdaptReport["skippedUnpublishedAreas"] = [];
  const rows: NormalizedBenchmarkRow[] = [];
  let metropolitanCount = 0;
  let nonmetropolitanCount = 0;

  for (const row of state.inScope) {
    countUnpublished(row.wages, unpublishedWageCells, unpublishedByMarker);
    const published = WAGE_COLUMNS.some(
      (column) => row.wages[column.field].kind === "value",
    );
    if (!published) {
      skippedUnpublishedAreas.push({
        workbook: row.workbook,
        excelRow: row.excelRow,
        geographicAreaCode: row.geographicAreaCode,
        geographicAreaName: row.geographicAreaName,
        geographicLevel: row.geographicLevel,
      });
      continue;
    }

    if (row.geographicLevel === "Metropolitan Statistical Area") {
      metropolitanCount += 1;
    } else if (row.geographicLevel === "Nonmetropolitan Area") {
      nonmetropolitanCount += 1;
    }

    rows.push(toNormalizedRow(row));
  }

  const report: OewsAdaptReport = {
    sourceUrl: OEWS_MAY_2025_SOURCE_URL,
    sourceFiles: OEWS_MAY_2025_WORKBOOKS.map((workbook) => workbook.fileName),
    totalSourceRowsRead: state.totalSourceRowsRead,
    rnRowsFound: state.rnRowsFound,
    normalizedRowsProduced: rows.length,
    metropolitanCount,
    nonmetropolitanCount,
    skipped: {
      notConfiguredOccupation: state.skippedNotConfigured,
      notCrossIndustryCrossOwnership: state.skippedNotCrossIndustry,
      allWagesUnpublished: skippedUnpublishedAreas.length,
    },
    unpublishedWageCells,
    unpublishedByMarker,
    duplicateGeographyIdentities: 0,
    skippedUnpublishedAreas,
  };

  return { rows, report };
}

export function formatAdaptReport(report: OewsAdaptReport) {
  const skippedAreas = report.skippedUnpublishedAreas
    .map(
      (area) =>
        `- ${area.geographicAreaCode} ${area.geographicAreaName} (${area.geographicLevel}; ${area.workbook} row ${area.excelRow})`,
    )
    .join("\n");

  return [
    "OEWS May 2025 registered-nurse adapter",
    `Source URL: ${report.sourceUrl}`,
    `Source files: ${report.sourceFiles.join(", ")}`,
    `Occupation: 29-1141 Registered Nurses -> registered-nurse`,
    "",
    `Total source rows read:              ${report.totalSourceRowsRead}`,
    `RN rows found:                       ${report.rnRowsFound}`,
    `Normalized rows produced:            ${report.normalizedRowsProduced}`,
    `Metropolitan rows produced:          ${report.metropolitanCount}`,
    `Nonmetropolitan rows produced:       ${report.nonmetropolitanCount}`,
    `Duplicate RN geography identities:   ${report.duplicateGeographyIdentities}`,
    "",
    "Rows skipped:",
    `  not a configured occupation:       ${report.skipped.notConfiguredOccupation}`,
    `  not cross-industry cross-ownership: ${report.skipped.notCrossIndustryCrossOwnership}`,
    `  all wages unpublished:             ${report.skipped.allWagesUnpublished}`,
    "",
    "Unpublished wage cells (null, not zero):",
    `  hourlyMean:                        ${report.unpublishedWageCells.hourlyMean}`,
    `  hourlyMedian:                      ${report.unpublishedWageCells.hourlyMedian}`,
    `  annualMean:                        ${report.unpublishedWageCells.annualMean}`,
    `  annualMedian:                      ${report.unpublishedWageCells.annualMedian}`,
    `  marker *:                          ${report.unpublishedByMarker.unavailable}`,
    `  marker #:                          ${report.unpublishedByMarker.topCoded}`,
    `  marker **:                         ${report.unpublishedByMarker.employmentUnavailable}`,
    `  blank:                             ${report.unpublishedByMarker.blank}`,
    "",
    skippedAreas
      ? `All-unpublished areas:\n${skippedAreas}`
      : "All-unpublished areas: none",
  ].join("\n");
}
