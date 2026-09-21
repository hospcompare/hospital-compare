-- CreateTable
CREATE TABLE "local_pay_benchmarks" (
    "id" TEXT NOT NULL,
    "profession_id" TEXT NOT NULL,
    "geographic_area_code" TEXT NOT NULL,
    "geographic_area_name" TEXT NOT NULL,
    "geographic_level" TEXT NOT NULL,
    "hourly_mean" DECIMAL(8,2),
    "hourly_median" DECIMAL(8,2),
    "annual_mean" DECIMAL(12,2),
    "annual_median" DECIMAL(12,2),
    "source" TEXT NOT NULL,
    "source_dataset" TEXT NOT NULL,
    "source_url" TEXT,
    "effective_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "local_pay_benchmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "local_pay_benchmarks_source_source_dataset_idx" ON "local_pay_benchmarks"("source", "source_dataset");

-- CreateIndex
CREATE UNIQUE INDEX "local_pay_benchmarks_profession_id_geographic_area_code_geo_key" ON "local_pay_benchmarks"("profession_id", "geographic_area_code", "geographic_level", "source", "source_dataset");

-- AddForeignKey
ALTER TABLE "local_pay_benchmarks" ADD CONSTRAINT "local_pay_benchmarks_profession_id_fkey" FOREIGN KEY ("profession_id") REFERENCES "professions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
