-- CreateEnum
CREATE TYPE "WorkplaceMetricValueType" AS ENUM ('number', 'boolean', 'text', 'option');

-- CreateTable
CREATE TABLE "professions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "specialties" (
    "id" TEXT NOT NULL,
    "profession_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workplace_reports" (
    "id" TEXT NOT NULL,
    "hospital_ccn" TEXT NOT NULL,
    "profession_id" TEXT NOT NULL,
    "specialty_id" TEXT,
    "employment_type" "EmploymentType" NOT NULL,
    "experience_date" DATE,
    "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'pending',
    "fraud_risk_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workplace_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workplace_metrics" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "value_type" "WorkplaceMetricValueType" NOT NULL,
    "unit" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workplace_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workplace_observations" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "metric_id" TEXT NOT NULL,
    "numeric_value" DECIMAL(12,3),
    "boolean_value" BOOLEAN,
    "text_value" TEXT,
    "option_value" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workplace_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "professions_slug_key" ON "professions"("slug");

-- CreateIndex
CREATE INDEX "professions_active_sort_order_idx" ON "professions"("active", "sort_order");

-- CreateIndex
CREATE INDEX "specialties_profession_id_active_sort_order_idx" ON "specialties"("profession_id", "active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "specialties_profession_id_slug_key" ON "specialties"("profession_id", "slug");

-- CreateIndex
CREATE INDEX "workplace_reports_hospital_ccn_moderation_status_idx" ON "workplace_reports"("hospital_ccn", "moderation_status");

-- CreateIndex
CREATE INDEX "workplace_reports_hospital_ccn_profession_id_moderation_sta_idx" ON "workplace_reports"("hospital_ccn", "profession_id", "moderation_status");

-- CreateIndex
CREATE INDEX "workplace_reports_profession_id_specialty_id_idx" ON "workplace_reports"("profession_id", "specialty_id");

-- CreateIndex
CREATE INDEX "workplace_reports_experience_date_idx" ON "workplace_reports"("experience_date");

-- CreateIndex
CREATE UNIQUE INDEX "workplace_metrics_slug_key" ON "workplace_metrics"("slug");

-- CreateIndex
CREATE INDEX "workplace_metrics_category_active_sort_order_idx" ON "workplace_metrics"("category", "active", "sort_order");

-- CreateIndex
CREATE INDEX "workplace_observations_metric_id_idx" ON "workplace_observations"("metric_id");

-- CreateIndex
CREATE UNIQUE INDEX "workplace_observations_report_id_metric_id_key" ON "workplace_observations"("report_id", "metric_id");

-- AddForeignKey
ALTER TABLE "specialties" ADD CONSTRAINT "specialties_profession_id_fkey" FOREIGN KEY ("profession_id") REFERENCES "professions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workplace_reports" ADD CONSTRAINT "workplace_reports_hospital_ccn_fkey" FOREIGN KEY ("hospital_ccn") REFERENCES "hospitals"("ccn") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workplace_reports" ADD CONSTRAINT "workplace_reports_profession_id_fkey" FOREIGN KEY ("profession_id") REFERENCES "professions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workplace_reports" ADD CONSTRAINT "workplace_reports_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workplace_observations" ADD CONSTRAINT "workplace_observations_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "workplace_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workplace_observations" ADD CONSTRAINT "workplace_observations_metric_id_fkey" FOREIGN KEY ("metric_id") REFERENCES "workplace_metrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
