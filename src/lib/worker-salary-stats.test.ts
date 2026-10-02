import assert from "node:assert/strict";
import test from "node:test";
import { workerSalaryReportSubmitSchema } from "./contracts";
import { medianOf, summarizePayValues } from "./worker-salary-stats";

const validHourly = {
  hospitalCcn: "WSRTEST01",
  professionSlug: "wsr-test-rn",
  specialtySlug: "wsr-test-icu",
  employmentType: "staff",
  hourlyRate: 48.5,
  experienceMonth: "2024-06",
};

test("median is the middle value for an odd count", () => {
  assert.equal(medianOf([90, 40, 50]), 50);
  assert.deepEqual(summarizePayValues([90, 40, 50]), {
    count: 3,
    median: 50,
    mean: 60,
    min: 40,
    max: 90,
  });
});

test("median is the mean of the two middle values for an even count", () => {
  assert.equal(medianOf([40, 90, 70, 50]), 60);
  assert.deepEqual(summarizePayValues([40, 90, 70, 50]), {
    count: 4,
    median: 60,
    mean: 62.5,
    min: 40,
    max: 90,
  });
});

test("empty pay sample has a zero count and null statistics", () => {
  assert.equal(medianOf([]), null);
  assert.deepEqual(summarizePayValues([]), {
    count: 0,
    median: null,
    mean: null,
    min: null,
    max: null,
  });
});

test("submit schema accepts hourly pay and optional annual pay separately", () => {
  const parsed = workerSalaryReportSubmitSchema.parse({
    ...validHourly,
    shiftDifferential: 4,
    otherHourlyDifferential: 1.25,
    annualSalary: 100000,
  });

  assert.equal(parsed.hourlyRate, 48.5);
  assert.equal(parsed.annualSalary, 100000);
  assert.equal(parsed.specialtySlug, "wsr-test-icu");
});

test("submit schema accepts annual pay without an hourly rate", () => {
  const parsed = workerSalaryReportSubmitSchema.parse({
    hospitalCcn: "WSRTEST01",
    professionSlug: "wsr-test-rn",
    employmentType: "staff",
    annualSalary: 90000,
  });

  assert.equal(parsed.hourlyRate ?? null, null);
  assert.equal(parsed.annualSalary, 90000);
  assert.equal(parsed.specialtySlug, null);
});

test("submit schema rejects a client-supplied moderation status", () => {
  const parsed = workerSalaryReportSubmitSchema.safeParse({
    ...validHourly,
    moderationStatus: "approved",
  });

  assert.equal(parsed.success, false);
});

test("submit schema rejects negative compensation and values past the decimal columns", () => {
  assert.equal(
    workerSalaryReportSubmitSchema.safeParse({
      ...validHourly,
      hourlyRate: -1,
    }).success,
    false,
  );
  assert.equal(
    workerSalaryReportSubmitSchema.safeParse({
      ...validHourly,
      hourlyRate: 10_000_000,
    }).success,
    false,
  );
  assert.equal(
    workerSalaryReportSubmitSchema.safeParse({
      ...validHourly,
      annualSalary: -5,
    }).success,
    false,
  );
  assert.equal(
    workerSalaryReportSubmitSchema.safeParse({
      hospitalCcn: "WSRTEST01",
      professionSlug: "wsr-test-rn",
      employmentType: "staff",
    }).success,
    false,
  );
});

test("submit schema rejects hourly differentials without an hourly rate", () => {
  const parsed = workerSalaryReportSubmitSchema.safeParse({
    hospitalCcn: "WSRTEST01",
    professionSlug: "wsr-test-rn",
    employmentType: "staff",
    annualSalary: 90000,
    shiftDifferential: 3,
  });

  assert.equal(parsed.success, false);
});
