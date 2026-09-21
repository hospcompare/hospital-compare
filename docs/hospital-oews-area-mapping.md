# Hospital to OEWS area mapping

Read-only prototype. `HospitalCountyResolution` and `OewsAreaCounty` are in the Prisma schema, and the migration SQL is not applied. This script does not populate those tables, change the UI, or write `hospitals` or `local_pay_benchmarks`.

The production join is county FIPS to the BLS May 2025 area-definition workbook. ZIP is a cross-check. City-name similarity is not the method.

## Sources

| Step | Source | What it provides |
| --- | --- | --- |
| 1 | CMS Hospital General Information, dataset `xubh-q36u` | CCN, state, county/parish, city, ZIP. Same fields as `scripts/import-cms-hospitals.ts`. |
| 2 | Census Bureau all-geocodes vintage 2024 (`all-geocodes-v2024.xlsx`, summary level 050) | Current county-equivalent FIPS and legal name, including Connecticut planning regions. |
| 2b | Same file, summary level 061, Connecticut only | Town (county subdivision) to planning-region FIPS. |
| 3 | BLS `area_definitions_m2025.xlsx` | One row per county. `May 2025 Area Code` is the wage-workbook `AREA` value stored on `LocalPayBenchmark.geographicAreaCode`. |
| Check | BLS time series `oe.area` | Same 528 market codes and names. |
| Check | OMB Bulletin 23-01 list 1 (`list1_2023.xlsx`) | County to CBSA. Metropolitan CBSA code matches the OEWS metro area code. Micropolitan counties are not OEWS areas. |
| Check | Census 2020 ZCTA-to-county relationship | Land-area overlap of a ZIP Code Tabulation Area and counties. This is not a USPS ZIP crosswalk. |

BLS states that May 2025 metropolitan areas follow OMB Bulletin 23-01. Nonmetropolitan areas are OEWS areas defined with the State Workforce Agencies. A micropolitan CBSA is folded into an OEWS nonmetropolitan area. Mapping a hospital to its CBSA and stopping there misses those areas and uses the wrong code.

The definitions HTML page (`msa_def.htm`) omits counties that the workbook includes, including Lake County and Newton County, Indiana, in Chicago. The prototype uses the workbook.

HUD's USPS ZIP-to-county crosswalk is the right ZIP check for a facility ZIP. The public API returned HTTP 401 without a HUD User token, so this run used the Census ZCTA file instead.

`data/fixtures/oews-may-2025/` holds the workbook, an `oe.area` snapshot, and example CMS rows. The script downloads the live files when it can. Generated downloads stay in `data/generated/oews-area-mapping/`, which is gitignored.

## Mapping chain

```text
CMS state + county/parish
  → Census 2024 county equivalent (exact name within the state)
  → 5-digit county FIPS
  → BLS area_definitions_m2025.xlsx
  → geographicAreaCode + geographicAreaName + geographicLevel
  → LocalPayBenchmark for that OEWS release
```

`geographicAreaCode` is copied from the workbook:

- Metropolitan: 5-digit CBSA code (`42660` for Seattle-Tacoma-Bellevue). This matches `AREA` in `MSA_M2025_dl.xlsx`.
- Nonmetropolitan: 7-digit BLS code (`5300006` for Western Washington). This matches `AREA` in `BOS_M2025_dl.xlsx`.

`oe.area` stores metropolitan codes as 7 digits with a `00` prefix (`0042660`). The prototype does not store that form. The benchmark table uses the 5-digit code.

Name resolution, in order, stays inside one state and accepts a match only when it identifies one county FIPS:

1. Exact Census name.
2. Census name with the legal suffix removed (`Kitsap` → `Kitsap County`, `James City` → `James City County`). `CITY` is not stripped off the CMS value first.
3. CMS value with its own suffix removed (`Sitka Borough` → `Sitka City and Borough`).
4. Spacing-insensitive match (`DE KALB` → `DeKalb`, `LA SALLE` → `LaSalle`).
5. When both an independent city and a county share the base name, CMS `BALTIMORE` selects the county and CMS `BALTIMORE CITY` selects the city.
6. A whole-token compass abbreviation, only when the expanded name is unique (`E. BATON ROUGE` → East Baton Rouge Parish).
7. A finite list of published CMS strings in `CMS_COUNTY_ALIASES` (`THE DISTRICT`, `ST. JOHN BAPTIST`, and a few published misspellings). This is not edit distance.

Connecticut is the exception. CMS still publishes the eight legacy counties. OEWS uses the nine planning regions, and those regions do not follow the old county lines. For Connecticut only, the city is matched to the Census county-subdivision (town) name. `HARTFORD` matches `Hartford town` in the Capitol Planning Region. `STAFFORD SPRINGS`, `WILLIMANTIC`, and `MANSFIELD CENTER` are not towns, so those three hospitals stay unmapped.

`VALDEZ-CORDOVA` is the retired Alaska census area. It split into Chugach and Copper River. The CMS name is not one current county, so it is not mapped.

Guam, the U.S. Virgin Islands, American Samoa, and the Northern Mariana Islands are in the CMS file. May 2025 `oe.area` has no metropolitan or nonmetropolitan area for them (Guam and the Virgin Islands appear only as state totals). They stay unmapped.

## Prototype results

Command:

```bash
npx tsx scripts/map-hospital-oews-areas.ts
```

There is no populated application database in this environment. The run used the CMS Provider Data API extract that feeds `hospitals`: 5,419 facilities. Tests: `npx tsx --test scripts/oews/area-mapping/resolve.test.ts`. `npx tsc --noEmit` and `npm run build` succeed.

Reference integrity:

- 3,222 Census counties and 3,222 workbook counties. Zero normalized name mismatches.
- 528 OEWS markets. Zero code or name mismatches against `oe.area`.
- 1,252 of 1,252 OMB metropolitan counties have the same CBSA code as the OEWS area.
- 663 OMB micropolitan counties all fall in an OEWS nonmetropolitan area. None fall in an OEWS metropolitan area.

Hospitals:

| Result | Count |
| --- | ---: |
| Mapped | 5,408 (99.80%) |
| Unmapped | 11 |
| Metropolitan area | 3,498 |
| Nonmetropolitan area | 1,910 |

Of the 5,413 hospitals in states and Puerto Rico, 5 are unmapped (99.91% mapped). The other 6 unmapped hospitals are in territories that have no May 2025 metro or nonmetro OEWS area.

Unmapped:

| CCN | Place | Reason |
| --- | --- | --- |
| 021301, 021307 | Valdez and Cordova, AK | CMS county `VALDEZ-CORDOVA` is retired and split |
| 070008, 070021, 074008 | Stafford Springs, Willimantic, Mansfield Center, CT | CMS city is not the Census town |
| 480001, 480002, 640001, 650001, 650003, 660001 | VI, AS, GU, MP | No May 2025 metro/nonmetro OEWS area |

### Four markets

| Hospital | County FIPS | OEWS code | OEWS area | Level |
| --- | --- | --- | --- | --- |
| 500039 St. Michael Medical Center, Silverdale, WA | 53035 Kitsap | `14740` | Bremerton-Silverdale-Port Orchard, WA | Metropolitan |
| 520098 University of Wisconsin Hospitals, Madison, WI | 55025 Dane | `31540` | Madison, WI | Metropolitan |
| 340069 WakeMed Raleigh Campus, Raleigh, NC | 37183 Wake | `39580` | Raleigh-Cary, NC | Metropolitan |
| 340173 WakeMed Cary Hospital, Cary, NC | 37183 Wake | `39580` | Raleigh-Cary, NC | Metropolitan |
| 500064 Harborview Medical Center, Seattle, WA | 53033 King | `42660` | Seattle-Tacoma-Bellevue, WA | Metropolitan |

Hospitals in each published area in this CMS extract: Bremerton 1, Madison 11 (Dane, Columbia, Green, and Iowa counties), Raleigh-Cary 7 (Wake and Johnston; Franklin County is in the area and has no hospital in this extract), Seattle-Tacoma-Bellevue 33 (King, Pierce, and Snohomish). Durham-Chapel Hill is a different OEWS area from Raleigh-Cary.

A nonmetro check: 010005 Marshall Medical Centers, Marshall, AL, maps to `0100002` Northeast Alabama nonmetropolitan area.

## ZIP is not sufficient

OEWS areas are sets of counties. A USPS ZIP is not a county.

Using the 2020 ZCTA relationship as a stand-in:

| Check | Count |
| --- | ---: |
| Hospital ZIP with no ZCTA row | 136 |
| ZCTA county not in the May 2025 crosswalk | 34 |
| ZCTA in one county, and that county's OEWS area matches | 3,549 |
| ZCTA in one county, area disagrees | 0 |
| ZCTA in several counties, all in the same OEWS area | 1,023 |
| ZCTA spans more than one OEWS area, plurality land matches | 652 |
| Plurality land would assign a different OEWS area | 23 |
| Distinct hospital ZIPs that touch more than one OEWS area | 638 |
| ZCTAs in the national file that touch more than one OEWS area | 4,648 |

A single-county ZCTA agreed with the county-name result whenever both existed. That is not enough to make ZIP the key: 136 facility ZIPs are missing from the ZCTA file, 638 facility ZIPs touch more than one OEWS area, and plurality land area would assign the wrong market for 23 hospitals. Connecticut cannot be checked this way because the 2020 ZCTA file still uses the legacy counties.

County FIPS is required. A later HUD ZIP-to-county file can cross-check the CMS county. It should not replace it when the ZIP is split.

## Schema

Approved and added to `prisma/schema.prisma`. The migration SQL is in `prisma/migrations/20260922003000_add_oews_area_geography/migration.sql`. It has not been applied, and neither table is populated.

`hospitals` has no CBSA column and no OEWS area code. The CBSA is not the OEWS area for nonmetropolitan and micropolitan counties. The OEWS area code changes when OMB or BLS redraws areas, so it belongs on `oews_area_counties` for one release.

`Hospital` gains only `countyResolutions`. It has no new columns.

The May 2025 area-definition workbook has 3,222 county rows and 3,222 distinct county FIPS codes. Zero counties map to more than one OEWS area in that release, so `countyFips + source + sourceDataset` is the `OewsAreaCounty` identity. `HospitalCountyResolution` is unique on `hospitalCcn + source + sourceDataset`: one current county for a hospital and a county vintage. `source` and `sourceDataset` on the hospital row name the county authority (for example Census Bureau / `all-geocodes-v2024`), not the OEWS wage release.

There is no foreign key from `OewsAreaCounty` to `LocalPayBenchmark`. A later read joins county FIPS, then area code, geographic level, source, and source dataset. `RecordStatus` is not used. A later Census vintage or OEWS release is a new `sourceDataset`, not an update of the old rows.

```prisma
model HospitalCountyResolution {
  id               String   @id @default(cuid())
  hospitalCcn      String   @map("hospital_ccn")
  countyFips       String   @map("county_fips")
  countyName       String   @map("county_name")
  stateFips        String   @map("state_fips")
  /// Postal abbreviation, for example WA.
  stateCode        String   @map("state_code") @db.Char(2)
  source           String
  sourceDataset    String   @map("source_dataset")
  resolutionMethod String   @map("resolution_method")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  hospital Hospital @relation(fields: [hospitalCcn], references: [ccn], onDelete: Cascade)

  @@unique([hospitalCcn, source, sourceDataset])
  @@index([countyFips])
  @@map("hospital_county_resolutions")
}

model OewsAreaCounty {
  id                 String   @id @default(cuid())
  countyFips         String   @map("county_fips")
  geographicAreaCode String   @map("geographic_area_code")
  geographicAreaName String   @map("geographic_area_name")
  /// Published geography type, for example Metropolitan Statistical Area.
  geographicLevel    String   @map("geographic_level")
  source             String
  sourceDataset      String   @map("source_dataset")
  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  @@unique([countyFips, source, sourceDataset])
  @@index([countyFips, sourceDataset])
  @@index([geographicAreaCode, geographicLevel, sourceDataset])
  @@map("oews_area_counties")
}
```

Later read path, still not built:

```text
hospital_county_resolutions.county_fips
  = oews_area_counties.county_fips
  and oews_area_counties.geographic_area_code = local_pay_benchmarks.geographic_area_code
  and oews_area_counties.geographic_level = local_pay_benchmarks.geographic_level
  and oews_area_counties.source = local_pay_benchmarks.source
  and oews_area_counties.source_dataset = local_pay_benchmarks.source_dataset
```

Not done yet: import `area_definitions_m2025.xlsx` into `oews_area_counties`, or write resolver output into `hospital_county_resolutions`. Unresolved hospitals stay absent rather than guessed. Do not backfill `LocalPayBenchmark` and do not render benchmarks on the hospital page.

`prisma migrate diff` wrote the SQL file. `prisma migrate dev`, `prisma migrate deploy`, and `prisma db execute` were not run. The shadow database used to compute the diff is local to this check and is not the application database.
