import assert from "node:assert/strict";
import test from "node:test";

const databaseUrl = process.env.WORKER_SALARY_TEST_DATABASE_URL;
const hospitalCcn = "WSRTEST01";
const rnSlug = "wsr-test-rn";
const physicianSlug = "wsr-test-physician";
const icuSlug = "wsr-test-icu";
const edSlug = "wsr-test-ed";
const cardiologySlug = "wsr-test-cardiology";

test(
  "worker salary submission and approved aggregate",
  { skip: databaseUrl ? false : "WORKER_SALARY_TEST_DATABASE_URL is not set" },
  async () => {
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = await import("./db");
    const { getWorkerSalaryAggregate } = await import("./queries");
    const { POST } = await import("../app/api/worker-salary-reports/route");

    async function cleanup() {
      await prisma.workerSalaryReport.deleteMany({
        where: { hospitalCcn },
      });
      await prisma.specialty.deleteMany({
        where: { slug: { in: [icuSlug, edSlug, cardiologySlug] } },
      });
      await prisma.profession.deleteMany({
        where: { slug: { in: [rnSlug, physicianSlug] } },
      });
      await prisma.hospital.deleteMany({ where: { ccn: hospitalCcn } });
    }

    function post(body: unknown) {
      return POST(
        new Request("http://localhost/api/worker-salary-reports", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    }

    try {
      await cleanup();

      const rn = await prisma.profession.create({
        data: {
          slug: rnSlug,
          name: "WSR Test Registered Nurse",
          abbreviation: "RN",
          active: true,
        },
      });
      const physician = await prisma.profession.create({
        data: {
          slug: physicianSlug,
          name: "WSR Test Physician",
          abbreviation: "MD",
          active: true,
        },
      });
      const icu = await prisma.specialty.create({
        data: {
          professionId: rn.id,
          slug: icuSlug,
          name: "WSR Test Intensive Care",
          abbreviation: "ICU",
        },
      });
      const ed = await prisma.specialty.create({
        data: {
          professionId: rn.id,
          slug: edSlug,
          name: "WSR Test Emergency Department",
          abbreviation: "ED",
        },
      });
      await prisma.specialty.create({
        data: {
          professionId: physician.id,
          slug: cardiologySlug,
          name: "WSR Test Cardiology",
        },
      });
      await prisma.hospital.create({
        data: {
          ccn: hospitalCcn,
          name: "Worker Salary Test Hospital",
          address: "1 Test St",
          city: "Testville",
          state: "WA",
          zip: "00000",
        },
      });

      const created = await post({
        hospitalCcn,
        professionSlug: rnSlug,
        specialtySlug: icuSlug,
        employmentType: "staff",
        hourlyRate: 40,
        shiftDifferential: 10,
        experienceMonth: "2024-06",
      });
      const createdBody = (await created.json()) as {
        reportId?: string;
        moderationStatus?: string;
      };
      assert.equal(created.status, 201);
      assert.equal(createdBody.moderationStatus, "pending");
      assert.ok(createdBody.reportId);

      const pendingRow = await prisma.workerSalaryReport.findUniqueOrThrow({
        where: { id: createdBody.reportId },
      });
      assert.equal(pendingRow.moderationStatus, "pending");
      assert.equal(pendingRow.hospitalCcn, hospitalCcn);
      assert.equal(pendingRow.professionId, rn.id);
      assert.equal(pendingRow.specialtyId, icu.id);
      assert.equal(Number(pendingRow.hourlyRate), 40);
      assert.equal(Number(pendingRow.shiftDifferential), 10);
      assert.equal(pendingRow.annualSalary, null);
      assert.equal(
        pendingRow.experienceDate?.toISOString().slice(0, 10),
        "2024-06-01",
      );
      assert.equal(
        await prisma.salary.count({ where: { hospitalCcn } }),
        0,
      );

      const rejectedStatus = await post({
        hospitalCcn,
        professionSlug: rnSlug,
        specialtySlug: icuSlug,
        employmentType: "staff",
        hourlyRate: 40,
        moderationStatus: "approved",
      });
      assert.equal(rejectedStatus.status, 400);
      assert.equal(
        await prisma.workerSalaryReport.count({ where: { hospitalCcn } }),
        1,
      );

      const wrongSpecialty = await post({
        hospitalCcn,
        professionSlug: rnSlug,
        specialtySlug: cardiologySlug,
        employmentType: "staff",
        hourlyRate: 80,
      });
      assert.equal(wrongSpecialty.status, 400);
      const wrongSpecialtyBody = (await wrongSpecialty.json()) as {
        error?: string;
      };
      assert.equal(
        wrongSpecialtyBody.error,
        "Specialty does not belong to the supplied profession",
      );
      assert.equal(
        await prisma.workerSalaryReport.count({ where: { hospitalCcn } }),
        1,
      );

      const unknownHospital = await post({
        hospitalCcn: "WSR-NO-SUCH",
        professionSlug: rnSlug,
        specialtySlug: icuSlug,
        employmentType: "staff",
        hourlyRate: 80,
      });
      assert.equal(unknownHospital.status, 404);
      assert.equal(
        await prisma.workerSalaryReport.count({
          where: { hospitalCcn: "WSR-NO-SUCH" },
        }),
        0,
      );

      const beforeApproval = await getWorkerSalaryAggregate({
        hospitalCcn,
        professionSlug: rnSlug,
        specialtySlug: icuSlug,
      });
      assert.ok(beforeApproval);
      assert.equal(beforeApproval.approvedReportCount, 0);
      assert.equal(beforeApproval.hourly.count, 0);
      assert.equal(beforeApproval.hourly.median, null);

      await prisma.workerSalaryReport.update({
        where: { id: pendingRow.id },
        data: { moderationStatus: "approved" },
      });

      const oneApproved = await getWorkerSalaryAggregate({
        hospitalCcn,
        professionSlug: rnSlug,
        specialtySlug: icuSlug,
      });
      assert.ok(oneApproved);
      assert.equal(oneApproved.approvedReportCount, 1);
      assert.deepEqual(oneApproved.hourly, {
        count: 1,
        median: 40,
        mean: 40,
        min: 40,
        max: 40,
      });
      assert.equal(oneApproved.annual.count, 0);

      await prisma.workerSalaryReport.createMany({
        data: [
          {
            hospitalCcn,
            professionId: rn.id,
            specialtyId: icu.id,
            employmentType: "staff",
            hourlyRate: 50,
            moderationStatus: "approved",
          },
          {
            hospitalCcn,
            professionId: rn.id,
            specialtyId: icu.id,
            employmentType: "staff",
            hourlyRate: 90,
            moderationStatus: "approved",
          },
        ],
      });

      const oddMedian = await getWorkerSalaryAggregate({
        hospitalCcn,
        professionSlug: rnSlug,
        specialtySlug: icuSlug,
      });
      assert.ok(oddMedian);
      assert.deepEqual(oddMedian.hourly, {
        count: 3,
        median: 50,
        mean: 60,
        min: 40,
        max: 90,
      });

      await prisma.workerSalaryReport.create({
        data: {
          hospitalCcn,
          professionId: rn.id,
          specialtyId: icu.id,
          employmentType: "staff",
          hourlyRate: 70,
          moderationStatus: "approved",
        },
      });

      const evenMedian = await getWorkerSalaryAggregate({
        hospitalCcn,
        professionSlug: rnSlug,
        specialtySlug: icuSlug,
      });
      assert.ok(evenMedian);
      assert.deepEqual(evenMedian.hourly, {
        count: 4,
        median: 60,
        mean: 62.5,
        min: 40,
        max: 90,
      });

      await prisma.workerSalaryReport.create({
        data: {
          hospitalCcn,
          professionId: rn.id,
          specialtyId: icu.id,
          employmentType: "staff",
          annualSalary: 100000,
          moderationStatus: "approved",
        },
      });

      const separatedPay = await getWorkerSalaryAggregate({
        hospitalCcn,
        professionSlug: rnSlug,
        specialtySlug: icuSlug,
      });
      assert.ok(separatedPay);
      assert.equal(separatedPay.hourly.median, 60);
      assert.equal(separatedPay.hourly.count, 4);
      assert.deepEqual(separatedPay.annual, {
        count: 1,
        median: 100000,
        mean: 100000,
        min: 100000,
        max: 100000,
      });

      await prisma.workerSalaryReport.createMany({
        data: [
          {
            hospitalCcn,
            professionId: rn.id,
            specialtyId: ed.id,
            employmentType: "staff",
            hourlyRate: 200,
            moderationStatus: "approved",
          },
          {
            hospitalCcn,
            professionId: rn.id,
            specialtyId: null,
            employmentType: "staff",
            hourlyRate: 300,
            moderationStatus: "approved",
          },
          {
            hospitalCcn,
            professionId: rn.id,
            specialtyId: icu.id,
            employmentType: "staff",
            hourlyRate: 999,
            moderationStatus: "pending",
          },
          {
            hospitalCcn,
            professionId: rn.id,
            specialtyId: icu.id,
            employmentType: "staff",
            hourlyRate: 998,
            moderationStatus: "flagged",
          },
          {
            hospitalCcn,
            professionId: rn.id,
            specialtyId: icu.id,
            employmentType: "staff",
            hourlyRate: 997,
            moderationStatus: "rejected",
          },
          {
            hospitalCcn,
            professionId: physician.id,
            specialtyId: null,
            employmentType: "staff",
            hourlyRate: 15,
            moderationStatus: "approved",
          },
        ],
      });

      const icuOnly = await getWorkerSalaryAggregate({
        hospitalCcn,
        professionSlug: rnSlug,
        specialtySlug: icuSlug,
      });
      assert.ok(icuOnly);
      assert.deepEqual(icuOnly.hourly, evenMedian.hourly);
      assert.equal(icuOnly.specialtySlug, icuSlug);
      assert.equal(icuOnly.approvedReportCount, 5);

      const physicianAggregate = await getWorkerSalaryAggregate({
        hospitalCcn,
        professionSlug: physicianSlug,
      });
      assert.ok(physicianAggregate);
      assert.equal(physicianAggregate.specialtySlug, null);
      assert.deepEqual(physicianAggregate.hourly, {
        count: 1,
        median: 15,
        mean: 15,
        min: 15,
        max: 15,
      });

      const rnWide = await getWorkerSalaryAggregate({
        hospitalCcn,
        professionSlug: rnSlug,
      });
      assert.ok(rnWide);
      assert.equal(rnWide.hourly.count, 6);
      assert.equal(rnWide.hourly.min, 40);
      assert.equal(rnWide.hourly.max, 300);

      const wrongProfessionSpecialty = await getWorkerSalaryAggregate({
        hospitalCcn,
        professionSlug: rnSlug,
        specialtySlug: cardiologySlug,
      });
      assert.equal(wrongProfessionSpecialty, null);

      const missingHospital = await getWorkerSalaryAggregate({
        hospitalCcn: "WSR-NO-SUCH",
        professionSlug: rnSlug,
        specialtySlug: icuSlug,
      });
      assert.equal(missingHospital, null);
    } finally {
      await cleanup();
      assert.equal(
        await prisma.workerSalaryReport.count({ where: { hospitalCcn } }),
        0,
      );
      assert.equal(
        await prisma.hospital.count({ where: { ccn: hospitalCcn } }),
        0,
      );
      assert.equal(
        await prisma.profession.count({
          where: { slug: { in: [rnSlug, physicianSlug] } },
        }),
        0,
      );
      await prisma.$disconnect();
    }
  },
);
