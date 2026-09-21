# OEWS May 2025 geography snapshots

These files are unmodified text captures retrieved on 2026-09-21. They are the fallback when `bls.gov` and `download.bls.gov` refuse an unattended download. `scripts/map-hospital-oews-areas.ts` tries the live URLs first.

| File | Official source |
| --- | --- |
| `area_definitions_m2025.xlsx` | [May 2025 metropolitan and nonmetropolitan area definitions](https://www.bls.gov/oes/area_definitions_m2025.xlsx), retrieved 2026-09-21. This is the county-to-area workbook cited in the May 2025 OEWS technical note. Area codes match the wage-workbook `AREA` values. |
| `msa-definitions.md` | Text capture of [the definitions page](https://www.bls.gov/oes/current/msa_def.htm). The HTML county lists omit some counties that the workbook includes, so the prototype does not use this file as the crosswalk. |
| `oe.area` | [BLS OEWS time series `oe.area`](https://download.bls.gov/pub/time.series/oe/oe.area). The capture uses spaces between fields. The parser also accepts the tab-separated original. |
| `example-hospitals.json` | Public CMS Hospital General Information rows (dataset `xubh-q36u`) for the prototype cases. Not a full hospital file. |

Census county FIPS, the OMB Bulletin 23-01 delineation file, the Census ZCTA relationship, and the full CMS hospital extract are downloaded by the script into `data/generated/oews-area-mapping/`. That directory is gitignored.
