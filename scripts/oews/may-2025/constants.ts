/**
 * Official BLS OEWS May 2025 release constants.
 *
 * Source archive (metropolitan and nonmetropolitan area estimates):
 *   https://www.bls.gov/oes/special-requests/oesm25ma.zip
 *
 * file_descriptions.xlsx inside that archive names the workbooks:
 *   MSA_M2025_dl.xlsx — Metropolitan Statistical Area, cross-industry,
 *                       cross-ownership estimates
 *   BOS_M2025_dl.xlsx — Nonmetropolitan area, cross-industry,
 *                       cross-ownership estimates
 *
 * Area type labels are the May 2025 workbook field description, not a
 * hospital geography crosswalk:
 *   4 = Metropolitan Statistical Area (MSA)
 *   6 = Nonmetropolitan Area
 *
 * Wage notes in the same field description:
 *   *  = wage estimate is not available
 *   ** = employment estimate is not available
 *   #  = wage equal to or greater than $115.00 per hour or $239,200 per year
 */

export const OEWS_MAY_2025_SOURCE = "BLS OEWS";
export const OEWS_MAY_2025_DATASET = "OEWS-2025-MAY";
export const OEWS_MAY_2025_EFFECTIVE_DATE = "2025-05-01";
export const OEWS_MAY_2025_SOURCE_URL =
  "https://www.bls.gov/oes/special-requests/oesm25ma.zip";

/** Cross-industry, all-ownership total published in the metro/nonmetro workbooks. */
export const OEWS_CROSS_INDUSTRY_NAICS = "000000";
export const OEWS_CROSS_INDUSTRY_GROUP = "cross-industry";
export const OEWS_CROSS_OWNERSHIP_CODE = "1235";

export const OEWS_MAY_2025_WORKBOOKS = [
  {
    fileName: "MSA_M2025_dl.xlsx",
    areaType: "4",
    geographicLevel: "Metropolitan Statistical Area",
  },
  {
    fileName: "BOS_M2025_dl.xlsx",
    areaType: "6",
    geographicLevel: "Nonmetropolitan Area",
  },
] as const;

export type OewsMay2025Workbook = (typeof OEWS_MAY_2025_WORKBOOKS)[number];

/**
 * Profession-level OEWS occupation codes. Match occ_code only.
 * OEWS does not publish specialties, so this list must not infer them.
 * Add later professions here (CNA, RT, physician, pharmacist, and so on).
 */
export const OEWS_MAY_2025_OCCUPATIONS = [
  {
    occCode: "29-1141",
    occTitle: "Registered Nurses",
    professionSlug: "registered-nurse",
  },
] as const;

export type OewsMay2025Occupation = (typeof OEWS_MAY_2025_OCCUPATIONS)[number];

const occupationByCode = new Map<string, OewsMay2025Occupation>(
  OEWS_MAY_2025_OCCUPATIONS.map((occupation) => [occupation.occCode, occupation]),
);

export function occupationForCode(occCode: string) {
  return occupationByCode.get(occCode) ?? null;
}

export const NORMALIZED_BENCHMARK_COLUMNS = [
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

export type NormalizedBenchmarkColumn =
  (typeof NORMALIZED_BENCHMARK_COLUMNS)[number];

export const REQUIRED_OEWS_COLUMNS = [
  "AREA",
  "AREA_TITLE",
  "AREA_TYPE",
  "NAICS",
  "I_GROUP",
  "OWN_CODE",
  "OCC_CODE",
  "H_MEAN",
  "A_MEAN",
  "H_MEDIAN",
  "A_MEDIAN",
] as const;

export const WAGE_COLUMNS = [
  { header: "H_MEAN", field: "hourlyMean", integerDigits: 6 },
  { header: "H_MEDIAN", field: "hourlyMedian", integerDigits: 6 },
  { header: "A_MEAN", field: "annualMean", integerDigits: 10 },
  { header: "A_MEDIAN", field: "annualMedian", integerDigits: 10 },
] as const;

export type WageField = (typeof WAGE_COLUMNS)[number]["field"];
