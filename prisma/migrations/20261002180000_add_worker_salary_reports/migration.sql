-- CreateTable
CREATE TABLE "worker_salary_reports" (
    "id" TEXT NOT NULL,
    "hospital_ccn" TEXT NOT NULL,
    "profession_id" TEXT NOT NULL,
    "specialty_id" TEXT,
    "employment_type" "EmploymentType" NOT NULL,
    "hourly_rate" DECIMAL(8,2),
    "shift_differential" DECIMAL(8,2),
    "other_hourly_differential" DECIMAL(8,2),
    "annual_salary" DECIMAL(12,2),
    "experience_date" DATE,
    "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'pending',
    "fraud_risk_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_salary_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "worker_salary_reports_hospital_ccn_moderation_status_idx" ON "worker_salary_reports"("hospital_ccn", "moderation_status");

-- CreateIndex
CREATE INDEX "worker_salary_reports_hospital_ccn_profession_id_moderation_idx" ON "worker_salary_reports"("hospital_ccn", "profession_id", "moderation_status");

-- CreateIndex
CREATE INDEX "worker_salary_reports_hospital_ccn_profession_id_specialty__idx" ON "worker_salary_reports"("hospital_ccn", "profession_id", "specialty_id", "moderation_status");

-- CreateIndex
CREATE INDEX "worker_salary_reports_profession_id_specialty_id_idx" ON "worker_salary_reports"("profession_id", "specialty_id");

-- AddForeignKey
ALTER TABLE "worker_salary_reports" ADD CONSTRAINT "worker_salary_reports_hospital_ccn_fkey" FOREIGN KEY ("hospital_ccn") REFERENCES "hospitals"("ccn") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_salary_reports" ADD CONSTRAINT "worker_salary_reports_profession_id_fkey" FOREIGN KEY ("profession_id") REFERENCES "professions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_salary_reports" ADD CONSTRAINT "worker_salary_reports_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Storage constraints. These are nonnegative checks, not wage caps.
-- At least one compensation amount is required. Differentials require an hourly base rate.
ALTER TABLE "worker_salary_reports" ADD CONSTRAINT "worker_salary_reports_hourly_rate_nonnegative" CHECK ("hourly_rate" IS NULL OR "hourly_rate" >= 0);

ALTER TABLE "worker_salary_reports" ADD CONSTRAINT "worker_salary_reports_shift_differential_nonnegative" CHECK ("shift_differential" IS NULL OR "shift_differential" >= 0);

ALTER TABLE "worker_salary_reports" ADD CONSTRAINT "worker_salary_reports_other_hourly_differential_nonnegative" CHECK ("other_hourly_differential" IS NULL OR "other_hourly_differential" >= 0);

ALTER TABLE "worker_salary_reports" ADD CONSTRAINT "worker_salary_reports_annual_salary_nonnegative" CHECK ("annual_salary" IS NULL OR "annual_salary" >= 0);

ALTER TABLE "worker_salary_reports" ADD CONSTRAINT "worker_salary_reports_compensation_present" CHECK ("hourly_rate" IS NOT NULL OR "annual_salary" IS NOT NULL);

ALTER TABLE "worker_salary_reports" ADD CONSTRAINT "worker_salary_reports_shift_differential_requires_hourly" CHECK ("shift_differential" IS NULL OR "hourly_rate" IS NOT NULL);

ALTER TABLE "worker_salary_reports" ADD CONSTRAINT "worker_salary_reports_other_differential_requires_hourly" CHECK ("other_hourly_differential" IS NULL OR "hourly_rate" IS NOT NULL);
