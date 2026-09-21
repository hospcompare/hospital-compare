-- CreateTable
CREATE TABLE "hospital_county_resolutions" (
    "id" TEXT NOT NULL,
    "hospital_ccn" TEXT NOT NULL,
    "county_fips" TEXT NOT NULL,
    "county_name" TEXT NOT NULL,
    "state_fips" TEXT NOT NULL,
    "state_code" CHAR(2) NOT NULL,
    "source" TEXT NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "resolution_method" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_county_resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oews_area_counties" (
    "id" TEXT NOT NULL,
    "county_fips" TEXT NOT NULL,
    "geographic_area_code" TEXT NOT NULL,
    "geographic_area_name" TEXT NOT NULL,
    "geographic_level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oews_area_counties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hospital_county_resolutions_county_fips_idx" ON "hospital_county_resolutions"("county_fips");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_county_resolutions_hospital_ccn_source_source_data_key" ON "hospital_county_resolutions"("hospital_ccn", "source", "source_dataset");

-- CreateIndex
CREATE INDEX "oews_area_counties_county_fips_source_dataset_idx" ON "oews_area_counties"("county_fips", "source_dataset");

-- CreateIndex
CREATE INDEX "oews_area_counties_geographic_area_code_geographic_level_so_idx" ON "oews_area_counties"("geographic_area_code", "geographic_level", "source_dataset");

-- CreateIndex
CREATE UNIQUE INDEX "oews_area_counties_county_fips_source_source_dataset_key" ON "oews_area_counties"("county_fips", "source", "source_dataset");

-- AddForeignKey
ALTER TABLE "hospital_county_resolutions" ADD CONSTRAINT "hospital_county_resolutions_hospital_ccn_fkey" FOREIGN KEY ("hospital_ccn") REFERENCES "hospitals"("ccn") ON DELETE CASCADE ON UPDATE CASCADE;

