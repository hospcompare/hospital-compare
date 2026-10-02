import assert from "node:assert/strict";
import test from "node:test";
import { aggregateWorkerSalarySamplesBySpecialty } from "./worker-salary-stats";
import {
  MIN_PUBLIC_WORKER_SALARY_REPORTS,
  WORKER_SALARY_PUBLIC_BELOW_THRESHOLD,
  WORKER_SALARY_PUBLIC_EMPTY,
  formatWorkerSalaryPublicFigure,
  formatWorkerSalaryPublicReportCount,
  isWorkerSalaryAggregatePubliclyDisplayable,
  selectWorkerSalaryPublicDisplay,
  toWorkerSalarySpecialtyPublicPay,
  workerSalaryPublicDisplayForSpecialty,
  workerSalaryPublicUnavailableMessage,
  type WorkerSalaryPublicAggregateInput,
} from "./worker-salary-public-display";

function aggregate({
  hourlyCount,
  hourlyMedian = 59.25,
  annualCount,
  annualMedian = 120000,
  approvedReportCount,
  hourlyMean = 61.5,
  hourlyMin = 40,
  hourlyMax = 90,
  annualMean = 130000,
  annualMin = 100000,
  annualMax = 180000,
}: {
  hourlyCount: number;
  hourlyMedian?: number | null;
  annualCount: number;
  annualMedian?: number | null;
  approvedReportCount?: number;
  hourlyMean?: number | null;
  hourlyMin?: number | null;
  hourlyMax?: number | null;
  annualMean?: number | null;
  annualMin?: number | null;
  annualMax?: number | null;
}): WorkerSalaryPublicAggregateInput & {
  hourly: WorkerSalaryPublicAggregateInput["hourly"] & {
    mean: number | null;
    min: number | null;
    max: number | null;
  };
  annual: WorkerSalaryPublicAggregateInput["annual"] & {
    mean: number | null;
    min: number | null;
    max: number | null;
  };
} {
  return {
    approvedReportCount:
      approvedReportCount ?? Math.max(hourlyCount, annualCount),
    hourly: {
      count: hourlyCount,
      median: hourlyCount === 0 ? null : hourlyMedian,
      mean: hourlyCount === 0 ? null : hourlyMean,
      min: hourlyCount === 0 ? null : hourlyMin,
      max: hourlyCount === 0 ? null : hourlyMax,
    },
    annual: {
      count: annualCount,
      median: annualCount === 0 ? null : annualMedian,
      mean: annualCount === 0 ? null : annualMean,
      min: annualCount === 0 ? null : annualMin,
      max: annualCount === 0 ? null : annualMax,
    },
  };
}

test("public display minimum is five approved reports of one compensation type", () => {
  assert.equal(MIN_PUBLIC_WORKER_SALARY_REPORTS, 5);
});

test("zero hourly reports are not publicly displayable", () => {
  const sample = aggregate({ hourlyCount: 0, annualCount: 0 });
  assert.equal(
    isWorkerSalaryAggregatePubliclyDisplayable(sample, "hourly"),
    false,
  );
  assert.deepEqual(selectWorkerSalaryPublicDisplay(sample), { state: "none" });
  assert.equal(
    workerSalaryPublicUnavailableMessage(selectWorkerSalaryPublicDisplay(sample)),
    WORKER_SALARY_PUBLIC_EMPTY,
  );
});

test("four hourly reports are not publicly displayable", () => {
  const sample = aggregate({
    hourlyCount: 4,
    annualCount: 0,
    approvedReportCount: 4,
  });
  assert.equal(
    isWorkerSalaryAggregatePubliclyDisplayable(sample, "hourly"),
    false,
  );
  assert.equal(
    isWorkerSalaryAggregatePubliclyDisplayable(sample, "annual"),
    false,
  );
  const display = selectWorkerSalaryPublicDisplay(sample);
  assert.deepEqual(display, { state: "below-threshold" });
  assert.equal(JSON.stringify(display).includes("4"), false);
  assert.equal(
    workerSalaryPublicUnavailableMessage(display),
    WORKER_SALARY_PUBLIC_BELOW_THRESHOLD,
  );
  assert.equal(workerSalaryPublicUnavailableMessage(display)?.includes("4"), false);
});

test("five hourly reports are publicly displayable", () => {
  const sample = aggregate({
    hourlyCount: 5,
    hourlyMedian: 59.25,
    annualCount: 0,
    approvedReportCount: 5,
    hourlyMean: 70,
    hourlyMin: 41,
    hourlyMax: 99,
  });
  assert.equal(isWorkerSalaryAggregatePubliclyDisplayable(sample, "hourly"), true);
  const display = selectWorkerSalaryPublicDisplay(sample);
  assert.deepEqual(display, {
    state: "eligible",
    compensation: "hourly",
    median: 59.25,
    count: 5,
  });
  assert.deepEqual(
    Object.keys(display).sort(),
    ["compensation", "count", "median", "state"],
  );
  assert.equal(formatWorkerSalaryPublicFigure(
    display as Extract<typeof display, { state: "eligible" }>,
  ), "$59.25/hr median");
  assert.equal(formatWorkerSalaryPublicReportCount(5), "5 approved reports");
  assert.equal(JSON.stringify(display).includes("70"), false);
  assert.equal(JSON.stringify(display).includes("41"), false);
  assert.equal(JSON.stringify(display).includes("99"), false);
});

test("hourly count of five displays the hourly median and that count only", () => {
  const sample = aggregate({
    hourlyCount: 5,
    hourlyMedian: 59.25,
    annualCount: 5,
    annualMedian: 140000,
    approvedReportCount: 9,
  });
  const display = selectWorkerSalaryPublicDisplay(sample);
  assert.deepEqual(display, {
    state: "eligible",
    compensation: "hourly",
    median: 59.25,
    count: 5,
  });
  assert.notEqual(
    display.state === "eligible" ? display.count : null,
    sample.approvedReportCount,
  );
});

test("three hourly and five annual may display annual and may not display hourly", () => {
  const sample = aggregate({
    hourlyCount: 3,
    hourlyMedian: 48,
    annualCount: 5,
    annualMedian: 125000,
    approvedReportCount: 8,
    annualMean: 140000,
    annualMin: 90000,
    annualMax: 200000,
  });
  assert.equal(
    isWorkerSalaryAggregatePubliclyDisplayable(sample, "hourly"),
    false,
  );
  assert.equal(
    isWorkerSalaryAggregatePubliclyDisplayable(sample, "annual"),
    true,
  );
  const display = selectWorkerSalaryPublicDisplay(sample);
  assert.deepEqual(display, {
    state: "eligible",
    compensation: "annual",
    median: 125000,
    count: 5,
  });
  assert.equal(
    formatWorkerSalaryPublicFigure(
      display as Extract<typeof display, { state: "eligible" }>,
    ),
    "$125,000 annual median",
  );
  assert.equal(JSON.stringify(display).includes("48"), false);
  assert.equal(JSON.stringify(display).includes("3"), false);
  assert.equal(JSON.stringify(display).includes("8"), false);
  assert.equal(JSON.stringify(display).includes("140000"), false);
});

test("five hourly and three annual may display hourly and may not display annual", () => {
  const sample = aggregate({
    hourlyCount: 5,
    hourlyMedian: 62.5,
    annualCount: 3,
    annualMedian: 110000,
    approvedReportCount: 8,
  });
  assert.equal(isWorkerSalaryAggregatePubliclyDisplayable(sample, "hourly"), true);
  assert.equal(
    isWorkerSalaryAggregatePubliclyDisplayable(sample, "annual"),
    false,
  );
  const display = selectWorkerSalaryPublicDisplay(sample);
  assert.deepEqual(display, {
    state: "eligible",
    compensation: "hourly",
    median: 62.5,
    count: 5,
  });
  assert.equal(JSON.stringify(display).includes("110000"), false);
  assert.equal(JSON.stringify(display).includes("\"count\":3"), false);
});

test("three hourly plus three annual does not satisfy either display minimum", () => {
  const sample = aggregate({
    hourlyCount: 3,
    annualCount: 3,
    approvedReportCount: 6,
  });
  assert.equal(
    isWorkerSalaryAggregatePubliclyDisplayable(sample, "hourly"),
    false,
  );
  assert.equal(
    isWorkerSalaryAggregatePubliclyDisplayable(sample, "annual"),
    false,
  );
  const display = selectWorkerSalaryPublicDisplay(sample);
  assert.deepEqual(display, { state: "below-threshold" });
  assert.equal(JSON.stringify(display), JSON.stringify({ state: "below-threshold" }));
});

test("a low-sample display does not carry the hidden count", () => {
  const sample = aggregate({
    hourlyCount: 1,
    hourlyMedian: 77.77,
    annualCount: 2,
    annualMedian: 88000,
    approvedReportCount: 3,
  });
  const display = selectWorkerSalaryPublicDisplay(sample);
  const projected = toWorkerSalarySpecialtyPublicPay([
    { specialtySlug: "intensive-care", ...sample },
  ]);
  const serialized = JSON.stringify(projected);
  assert.equal(serialized.includes("77.77"), false);
  assert.equal(serialized.includes("88000"), false);
  assert.equal(serialized.includes("\"count\""), false);
  assert.equal(workerSalaryPublicUnavailableMessage(display)?.match(/\d/), null);
});

test("ICU grouping excludes ED and unspecified reports", () => {
  const grouped = aggregateWorkerSalarySamplesBySpecialty([
    { specialtySlug: "intensive-care", hourlyRate: 50, annualSalary: null },
    { specialtySlug: "intensive-care", hourlyRate: 52, annualSalary: null },
    { specialtySlug: "intensive-care", hourlyRate: 54, annualSalary: null },
    { specialtySlug: "intensive-care", hourlyRate: 56, annualSalary: null },
    { specialtySlug: "intensive-care", hourlyRate: 58, annualSalary: null },
    { specialtySlug: "emergency-department", hourlyRate: 200, annualSalary: null },
    { specialtySlug: null, hourlyRate: 300, annualSalary: null },
  ]);

  const icu = grouped.find((row) => row.specialtySlug === "intensive-care");
  const ed = grouped.find((row) => row.specialtySlug === "emergency-department");
  const unspecified = grouped.find((row) => row.specialtySlug === null);
  assert.ok(icu);
  assert.ok(ed);
  assert.ok(unspecified);
  assert.equal(icu.hourly.count, 5);
  assert.equal(icu.hourly.median, 54);
  assert.equal(icu.hourly.min, 50);
  assert.equal(icu.hourly.max, 58);
  assert.equal(icu.approvedReportCount, 5);
  assert.equal(ed.hourly.median, 200);
  assert.equal(ed.hourly.count, 1);
  assert.equal(unspecified.hourly.median, 300);
  assert.equal(unspecified.approvedReportCount, 1);
  assert.equal(
    grouped.some((row) => row.specialtySlug === null && row.hourly.count !== 1),
    false,
  );
});

test("specialty lookup does not fall back to another specialty or the unspecified bucket", () => {
  const rows = toWorkerSalarySpecialtyPublicPay([
    {
      specialtySlug: "intensive-care",
      ...aggregate({ hourlyCount: 5, hourlyMedian: 59.25, annualCount: 0 }),
    },
    {
      specialtySlug: "emergency-department",
      ...aggregate({ hourlyCount: 2, hourlyMedian: 40, annualCount: 0 }),
    },
    {
      specialtySlug: null,
      ...aggregate({ hourlyCount: 6, hourlyMedian: 33, annualCount: 0 }),
    },
  ]);

  const icu = workerSalaryPublicDisplayForSpecialty(rows, "intensive-care");
  const ed = workerSalaryPublicDisplayForSpecialty(rows, "emergency-department");
  const unspecified = workerSalaryPublicDisplayForSpecialty(rows, null);
  const missing = workerSalaryPublicDisplayForSpecialty(rows, "medical-surgical");

  assert.deepEqual(icu, {
    state: "eligible",
    compensation: "hourly",
    median: 59.25,
    count: 5,
  });
  assert.deepEqual(ed, { state: "below-threshold" });
  assert.deepEqual(unspecified, {
    state: "eligible",
    compensation: "hourly",
    median: 33,
    count: 6,
  });
  assert.deepEqual(missing, { state: "none" });
});

test("public projection drops mean, min, and max", () => {
  const [projected] = toWorkerSalarySpecialtyPublicPay([
    {
      specialtySlug: "intensive-care",
      ...aggregate({
        hourlyCount: 5,
        hourlyMedian: 59.25,
        annualCount: 0,
        hourlyMean: 111.11,
        hourlyMin: 12.12,
        hourlyMax: 88.88,
      }),
    },
  ]);
  const serialized = JSON.stringify(projected);
  assert.equal(serialized.includes("111.11"), false);
  assert.equal(serialized.includes("12.12"), false);
  assert.equal(serialized.includes("88.88"), false);
  assert.equal(serialized.includes("mean"), false);
  assert.equal(serialized.includes("min"), false);
  assert.equal(serialized.includes("max"), false);
});
