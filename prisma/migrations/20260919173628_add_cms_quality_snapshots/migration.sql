-- CreateTable
CREATE TABLE "cms_quality_snapshots" (
    "id" TEXT NOT NULL,
    "hospital_ccn" TEXT NOT NULL,
    "overall_rating" INTEGER,
    "overall_rating_footnote" TEXT,
    "mortality_measure_count" INTEGER,
    "mortality_better" INTEGER,
    "mortality_same" INTEGER,
    "mortality_worse" INTEGER,
    "safety_measure_count" INTEGER,
    "safety_better" INTEGER,
    "safety_same" INTEGER,
    "safety_worse" INTEGER,
    "readmission_measure_count" INTEGER,
    "readmission_better" INTEGER,
    "readmission_same" INTEGER,
    "readmission_worse" INTEGER,
    "patient_experience_measure_count" INTEGER,
    "source_dataset" TEXT NOT NULL,
    "source_url" TEXT,
    "release_date" DATE NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cms_quality_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cms_quality_snapshots_hospital_ccn_idx" ON "cms_quality_snapshots"("hospital_ccn");

-- CreateIndex
CREATE INDEX "cms_quality_snapshots_overall_rating_idx" ON "cms_quality_snapshots"("overall_rating");

-- CreateIndex
CREATE UNIQUE INDEX "cms_quality_snapshots_hospital_ccn_release_date_key" ON "cms_quality_snapshots"("hospital_ccn", "release_date");

-- AddForeignKey
ALTER TABLE "cms_quality_snapshots" ADD CONSTRAINT "cms_quality_snapshots_hospital_ccn_fkey" FOREIGN KEY ("hospital_ccn") REFERENCES "hospitals"("ccn") ON DELETE CASCADE ON UPDATE CASCADE;
