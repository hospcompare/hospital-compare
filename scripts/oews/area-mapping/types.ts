/** Labor-market level stored on LocalPayBenchmark.geographicLevel. */
export type GeographicLevel =
  | "Metropolitan Statistical Area"
  | "Nonmetropolitan Area";

export type DefinitionCounty = {
  stateAbbrev: string;
  countyName: string;
  areaName: string;
  geographicLevel: GeographicLevel;
};

export type OeMarketArea = {
  /** 7-character code from the BLS oe.area time series. */
  areaCode: string;
  areaName: string;
  geographicLevel: GeographicLevel;
  /**
   * Code stored in the OEWS wage workbook AREA column and
   * LocalPayBenchmark.geographicAreaCode.
   * Metropolitan areas are the 5-digit CBSA code. Nonmetropolitan areas
   * keep the 7-digit oe.area code.
   */
  geographicAreaCode: string;
  /** 5-digit OMB CBSA code for metropolitan areas. Null for nonmetropolitan areas. */
  cbsaCode: string | null;
};

export type CensusCounty = {
  stateAbbrev: string;
  stateFips: string;
  countyFips3: string;
  name: string;
};

export type CtTown = {
  /** Planning-region county FIPS, 5 digits. */
  countyFips: string;
  name: string;
};

export type OewsAssignment = {
  countyFips: string;
  countyName: string;
  stateAbbrev: string;
  geographicAreaCode: string;
  geographicAreaName: string;
  geographicLevel: GeographicLevel;
  cbsaCode: string | null;
};

export type HospitalGeoInput = {
  ccn: string;
  name: string;
  city: string;
  state: string;
  zip: string;
  county: string | null;
};

export type HospitalAreaMatch = {
  ccn: string;
  status: "mapped" | "unmapped";
  /** Why this row mapped or failed. Stable machine-readable label. */
  method: string;
  countyFips: string | null;
  countyName: string | null;
  geographicAreaCode: string | null;
  geographicAreaName: string | null;
  geographicLevel: GeographicLevel | null;
  cbsaCode: string | null;
};

export type SheetRow = {
  excelRow: number;
  cells: Record<string, string>;
};
