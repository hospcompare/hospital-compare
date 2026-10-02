import assert from "node:assert/strict";
import test from "node:test";
import { selectWorkerSalaryPublicDisplay } from "./worker-salary-public-display";

const databaseUrl = process.env.WORKER_SALARY_TEST_DATABASE_URL;
const hospitalCcn = "WSRPUB01";
const rnSlug = "wsr-pub-rn";
const physicianSlug = "wsr-pub-physician";
const icuSlug = "wsr-pub-icu";
const edSlug = "wsr-pub-ed";

test(
  "bulk worker salary aggregates stay specialty and profession specific",
  { skip: databaseUrl ? false : "WORKER_SALARY_TEST_DATABASE_URL is not set" },
  async () => {
    process.env.DATABASE_URL = databaseUrl;
    const { prisma } = await import("./db");
    const {
      getWorkerSalaryAggregate,
      getWorkerSalaryAggregatesBySpecialty,
    } = await import("./queries");

    async function cleanup() {
      await prisma.workerSalaryReport.deleteMany({ where: { hospitalCcn } });
      await prisma.salary.deleteMany({ where: { hospitalCcn } });
      await prisma.specialty.deleteMany({
        where: { slug: { in: [icuSlug, edSlug] } },
      });
      await prisma.profession.deleteMany({
        where: { slug: { in: [rnSlug, physicianSlug] } },
      });
      await prisma.hospital.deleteMany({ where: { ccn: hospitalCcn } });
    }

    try {
      await cleanup();

      const rn = await prisma.profession.create({
        data: {
          slug: rnSlug,
          name: "Public Display Test RN",
          abbreviation: "RN",
          active: true,
        },
      });
      const physician = await prisma.profession.create({
        data: {
          slug: physicianSlug,
          name: "Public Display Test Physician",
          abbreviation: "MD",
          active: true,
        },
      });
      const icu = await prisma.specialty.create({
        data: {
          professionId: rn.id,
          slug: icuSlug,
          name: "Public Display ICU",
          abbreviation: "ICU",
        },
      });
      const ed = await prisma.specialty.create({
        data: {
          professionId: rn.id,
          slug: edSlug,
          name: "Public Display ED",
          abbreviation: "ED",
        },
      });
      await prisma.hospital.create({
        data: {
          ccn: hospitalCcn,
          name: "Public Display Test Hospital",
          address: "1 Test St",
          city: "Testville",
          state: "WA",
          zip: "00000",
        },
      });

      await prisma.workerSalaryReport.createMany({
        data: [
          ...[50, 52, 54, 56, 58].map((hourlyRate) => ({
            hospitalCcn,
            professionId: rn.id,
            specialtyId: icu.id,
            employmentType: "staff" as const,
            hourlyRate,
            shiftDifferential: 12,
            moderationStatus: "approved" as const,
            fraudRiskScore: 0.9,
          })),
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
            professionId: physician.id,
            specialtyId: null,
            employmentType: "staff",
            hourlyRate: 15,
            moderationStatus: "approved",
          },
        ],
      });

      const bulk = await getWorkerSalaryAggregatesBySpecialty({
        hospitalCcn,
        professionSlug: rnSlug,
      });
      assert.ok(bulk);
      const icuGroup = bulk.specialties.find(
        (row) => row.specialtySlug === icuSlug,
      );
      const edGroup = bulk.specialties.find((row) => row.specialtySlug === edSlug);
      const unspecified = bulk.specialties.find((row) => row.specialtySlug === null);
      assert.ok(icuGroup);
      assert.ok(edGroup);
      assert.ok(unspecified);

      assert.equal(icuGroup.hourly.count, 5);
      assert.equal(icuGroup.hourly.median, 54);
      assert.equal(icuGroup.hourly.min, 50);
      assert.equal(icuGroup.hourly.max, 58);
      assert.equal(icuGroup.approvedReportCount, 5);
      assert.equal(edGroup.hourly.median, 200);
      assert.equal(edGroup.hourly.count, 1);
      assert.equal(unspecified.hourly.median, 300);
      assert.equal(unspecified.hourly.count, 1);
      assert.equal(
        bulk.specialties.some((row) => row.hourly.median === 15),
        false,
      );

      const single = await getWorkerSalaryAggregate({
        hospitalCcn,
        professionSlug: rnSlug,
        specialtySlug: icuSlug,
      });
      assert.ok(single);
      assert.deepEqual(single.hourly, icuGroup.hourly);
      assert.deepEqual(single.annual, icuGroup.annual);
      assert.equal(single.approvedReportCount, icuGroup.approvedReportCount);

      const physicianBulk = await getWorkerSalaryAggregatesBySpecialty({
        hospitalCcn,
        professionSlug: physicianSlug,
      });
      assert.ok(physicianBulk);
      assert.equal(physicianBulk.specialties.length, 1);
      assert.equal(physicianBulk.specialties[0]?.specialtySlug, null);
      assert.equal(physicianBulk.specialties[0]?.hourly.median, 15);
      assert.equal(physicianBulk.specialties[0]?.hourly.count, 1);

      const icuDisplay = selectWorkerSalaryPublicDisplay(icuGroup);
      assert.deepEqual(icuDisplay, {
        state: "eligible",
        compensation: "hourly",
        median: 54,
        count: 5,
      });
      const edDisplay = selectWorkerSalaryPublicDisplay(edGroup);
      assert.deepEqual(edDisplay, { state: "below-threshold" });
      assert.equal(JSON.stringify(edDisplay).includes("1"), false);
      assert.equal(JSON.stringify(edDisplay).includes("200"), false);

      const missing = await getWorkerSalaryAggregatesBySpecialty({
        hospitalCcn: "WSRPUB-MISSING",
        professionSlug: rnSlug,
      });
      assert.equal(missing, null);
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
      await prisma.$disconnect();
    }
  },
);
