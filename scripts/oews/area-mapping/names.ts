/**
 * Census legal/statistical suffixes, longest first.
 * CITY is last so "City and Borough" is removed before a bare "City".
 */
export const COUNTY_SUFFIXES = [
  "CITY AND BOROUGH",
  "CENSUS AREA",
  "MUNICIPALITY",
  "PLANNING REGION",
  "MUNICIPIO",
  "PARISH",
  "BOROUGH",
  "COUNTY",
  "CITY",
] as const;

/** Suffixes that identify a county equivalent rather than an independent city. */
export const NON_CITY_SUFFIXES = new Set<string>([
  "CITY AND BOROUGH",
  "CENSUS AREA",
  "MUNICIPALITY",
  "PLANNING REGION",
  "MUNICIPIO",
  "PARISH",
  "BOROUGH",
  "COUNTY",
]);

export const STATE_NAME_TO_ABBREV: Readonly<Record<string, string>> = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  "District of Columbia": "DC",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Puerto Rico": "PR",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
};

export const STATE_FIPS_TO_ABBREV: Readonly<Record<string, string>> = {
  "01": "AL",
  "02": "AK",
  "04": "AZ",
  "05": "AR",
  "06": "CA",
  "08": "CO",
  "09": "CT",
  "10": "DE",
  "11": "DC",
  "12": "FL",
  "13": "GA",
  "15": "HI",
  "16": "ID",
  "17": "IL",
  "18": "IN",
  "19": "IA",
  "20": "KS",
  "21": "KY",
  "22": "LA",
  "23": "ME",
  "24": "MD",
  "25": "MA",
  "26": "MI",
  "27": "MN",
  "28": "MS",
  "29": "MO",
  "30": "MT",
  "31": "NE",
  "32": "NV",
  "33": "NH",
  "34": "NJ",
  "35": "NM",
  "36": "NY",
  "37": "NC",
  "38": "ND",
  "39": "OH",
  "40": "OK",
  "41": "OR",
  "42": "PA",
  "44": "RI",
  "45": "SC",
  "46": "SD",
  "47": "TN",
  "48": "TX",
  "49": "UT",
  "50": "VT",
  "51": "VA",
  "53": "WA",
  "54": "WV",
  "55": "WI",
  "56": "WY",
  "60": "AS",
  "66": "GU",
  "69": "MP",
  "72": "PR",
  "78": "VI",
};

/**
 * CMS Hospital General Information still publishes a few county strings that
 * are not the Census name. Each value was checked against the Census county
 * equivalent it denotes. This is a finite list, not edit-distance matching.
 * Keys are state abbreviation + "|" + normalizeGeographyName(cms county).
 */
export const CMS_COUNTY_ALIASES: Readonly<Record<string, string>> = {
  "DC|THE DISTRICT": "District of Columbia",
  "LA|ST JOHN BAPTIST": "St. John the Baptist Parish",
  "LA|JEFFRSON DAVIS": "Jefferson Davis Parish",
  "MN|LAKE OF WOODS": "Lake of the Woods County",
  "MN|YELLOW MEDCINE": "Yellow Medicine County",
  "NE|SCOTT BLUFF": "Scotts Bluff County",
  "AK|NORTHWEST ARTIC BOROUGH": "Northwest Arctic Borough",
  "AK|NORTH SLOPE BOROUH": "North Slope Borough",
};

/**
 * Valdez-Cordova Census Area was split in 2019 into Chugach Census Area and
 * Copper River Census Area. CMS still publishes the retired name. The two
 * successor areas are not one OEWS county, so the name is not a join key.
 */
export const RETIRED_CMS_COUNTIES = new Set<string>(["AK|VALDEZ CORDOVA"]);

/** OEWS May 2025 metro/nonmetro definitions do not cover these CMS states. */
export const OUTSIDE_OEWS_AREA_STATES = new Set<string>(["AS", "GU", "MP", "VI"]);

export function normalizeGeographyName(value: string): string {
  const stripped = value
    // The May 2025 workbook stores "Mayagüez" with a C1 control before "uez".
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replaceAll("&", " AND ")
    .replaceAll("'", "")
    .replaceAll("’", "")
    .replaceAll("‘", "")
    .replaceAll("`", "");
  return stripped
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactGeographyName(value: string): string {
  return normalizeGeographyName(value).replaceAll(" ", "");
}

export function splitCountySuffix(normalizedName: string): {
  base: string;
  suffix: string | null;
} {
  for (const suffix of COUNTY_SUFFIXES) {
    const marker = ` ${suffix}`;
    if (normalizedName.endsWith(marker)) {
      return {
        base: normalizedName.slice(0, -marker.length).trim(),
        suffix,
      };
    }
  }
  return { base: normalizedName, suffix: null };
}

/** Connecticut county-subdivision labels: town, city, borough. */
export function townMatchKey(value: string): string {
  const normalized = normalizeGeographyName(value);
  for (const suffix of ["CITY", "TOWN", "BOROUGH", "VILLAGE"]) {
    const marker = ` ${suffix}`;
    if (normalized.endsWith(marker)) {
      return normalized.slice(0, -marker.length).trim();
    }
  }
  return normalized;
}

export function expandCompassTokens(normalizedName: string): string | null {
  let changed = false;
  const expanded = normalizedName.split(" ").map((token) => {
    if (token === "E") {
      changed = true;
      return "EAST";
    }
    if (token === "W") {
      changed = true;
      return "WEST";
    }
    if (token === "N") {
      changed = true;
      return "NORTH";
    }
    if (token === "S") {
      changed = true;
      return "SOUTH";
    }
    return token;
  });
  return changed ? expanded.join(" ") : null;
}

export function padFipsPart(value: string, width: number): string {
  const digits = value.trim();
  if (!/^\d+$/.test(digits)) {
    throw new Error(`Expected a numeric FIPS part, received "${value}"`);
  }
  return digits.padStart(width, "0");
}
