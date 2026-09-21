-- AlterTable
ALTER TABLE "salaries" ADD COLUMN "profession_id" TEXT,
ADD COLUMN "specialty_id" TEXT;

-- CreateIndex
CREATE INDEX "salaries_hospital_ccn_profession_id_status_idx" ON "salaries"("hospital_ccn", "profession_id", "status");

-- CreateIndex
CREATE INDEX "salaries_hospital_ccn_profession_id_specialty_id_status_idx" ON "salaries"("hospital_ccn", "profession_id", "specialty_id", "status");

-- CreateIndex
CREATE INDEX "salaries_profession_id_idx" ON "salaries"("profession_id");

-- CreateIndex
CREATE INDEX "salaries_specialty_id_idx" ON "salaries"("specialty_id");

-- AddForeignKey
ALTER TABLE "salaries" ADD CONSTRAINT "salaries_profession_id_fkey" FOREIGN KEY ("profession_id") REFERENCES "professions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salaries" ADD CONSTRAINT "salaries_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "specialties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
