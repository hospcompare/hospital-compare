-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('staging', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('pending', 'approved', 'flagged', 'rejected');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('travel', 'staff', 'per_diem', 'contract', 'unknown');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('positive', 'mixed', 'negative', 'unknown');

-- CreateEnum
CREATE TYPE "CandidateType" AS ENUM ('hospital', 'fact', 'salary', 'col_index');

-- CreateTable
CREATE TABLE "hospitals" (
    "ccn" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "county" TEXT,
    "health_system" TEXT,
    "hospital_type" TEXT,
    "trauma_level" TEXT,
    "beds" INTEGER,
    "teaching_status" TEXT,
    "ownership" TEXT,
    "emr" TEXT,
    "website" TEXT,
    "magnet_status" TEXT,
    "is_seed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospitals_pkey" PRIMARY KEY ("ccn")
);

-- CreateTable
CREATE TABLE "hospital_facts" (
    "id" TEXT NOT NULL,
    "hospital_ccn" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "source_url" TEXT,
    "effective_date" DATE,
    "confidence" DOUBLE PRECISION,
    "status" "RecordStatus" NOT NULL DEFAULT 'staging',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salaries" (
    "id" TEXT NOT NULL,
    "hospital_ccn" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "hourly_min" DECIMAL(8,2) NOT NULL,
    "hourly_max" DECIMAL(8,2) NOT NULL,
    "annual" DECIMAL(12,2),
    "source" TEXT NOT NULL,
    "source_url" TEXT,
    "effective_date" DATE,
    "confidence" DOUBLE PRECISION,
    "status" "RecordStatus" NOT NULL DEFAULT 'staging',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "col_indexes" (
    "id" TEXT NOT NULL,
    "location_key" TEXT NOT NULL,
    "key_type" TEXT NOT NULL,
    "index_value" DECIMAL(8,2) NOT NULL,
    "dataset_name" TEXT NOT NULL,
    "as_of_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "col_indexes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "hospital_ccn" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "employment_type" "EmploymentType" NOT NULL,
    "unit" TEXT,
    "overall_score" INTEGER,
    "staffing_score" INTEGER,
    "management_score" INTEGER,
    "pay_score" INTEGER,
    "wlb_score" INTEGER,
    "sentiment" "Sentiment",
    "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'pending',
    "fraud_risk_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_flags" (
    "id" TEXT NOT NULL,
    "review_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_candidates" (
    "id" TEXT NOT NULL,
    "source_agent" TEXT NOT NULL,
    "candidate_type" "CandidateType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'staging',
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "staging_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_hospitals" (
    "id" TEXT NOT NULL,
    "ccn" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "source_url" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'staging',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staging_hospitals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hospitals_name_idx" ON "hospitals"("name");

-- CreateIndex
CREATE INDEX "hospitals_state_city_idx" ON "hospitals"("state", "city");

-- CreateIndex
CREATE INDEX "hospitals_zip_idx" ON "hospitals"("zip");

-- CreateIndex
CREATE INDEX "hospital_facts_hospital_ccn_field_name_status_idx" ON "hospital_facts"("hospital_ccn", "field_name", "status");

-- CreateIndex
CREATE INDEX "salaries_hospital_ccn_role_status_idx" ON "salaries"("hospital_ccn", "role", "status");

-- CreateIndex
CREATE INDEX "col_indexes_location_key_idx" ON "col_indexes"("location_key");

-- CreateIndex
CREATE UNIQUE INDEX "col_indexes_location_key_dataset_name_as_of_date_key" ON "col_indexes"("location_key", "dataset_name", "as_of_date");

-- CreateIndex
CREATE INDEX "reviews_hospital_ccn_moderation_status_idx" ON "reviews"("hospital_ccn", "moderation_status");

-- CreateIndex
CREATE INDEX "review_flags_review_id_idx" ON "review_flags"("review_id");

-- CreateIndex
CREATE INDEX "staging_candidates_status_created_at_idx" ON "staging_candidates"("status", "created_at");

-- CreateIndex
CREATE INDEX "staging_hospitals_ccn_status_idx" ON "staging_hospitals"("ccn", "status");

-- AddForeignKey
ALTER TABLE "hospital_facts" ADD CONSTRAINT "hospital_facts_hospital_ccn_fkey" FOREIGN KEY ("hospital_ccn") REFERENCES "hospitals"("ccn") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salaries" ADD CONSTRAINT "salaries_hospital_ccn_fkey" FOREIGN KEY ("hospital_ccn") REFERENCES "hospitals"("ccn") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_hospital_ccn_fkey" FOREIGN KEY ("hospital_ccn") REFERENCES "hospitals"("ccn") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_flags" ADD CONSTRAINT "review_flags_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
