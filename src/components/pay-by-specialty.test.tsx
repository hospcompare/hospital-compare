import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PayBySpecialty } from "./pay-by-specialty";
import type {
  HospitalProfessionSalaries,
  LocalPayBenchmarkLookup,
  ProfessionSalary,
} from "@/lib/contracts";
import {
  WORKER_SALARY_PUBLIC_BELOW_THRESHOLD,
  WORKER_SALARY_PUBLIC_EMPTY,
  toWorkerSalarySpecialtyPublicPay,
} from "@/lib/worker-salary-public-display";

const benchmark: LocalPayBenchmarkLookup = {
  hospitalCcn: "500039",
  profession: {
    id: "prof-rn",
    slug: "registered-nurse",
    name: "Registered Nurse",
    abbreviation: "RN",
  },
  geography: {
    countyFips: "53035",
    countyName: "Kitsap County",
    geographicAreaCode: "14740",
    geographicAreaName: "Bremerton-Silverdale-Port Orchard, WA",
    geographicLevel: "Metropolitan Statistical Area",
  },
  benchmark: {
    hourlyMean: 54.2,
    hourlyMedian: 51.55,
    annualMean: 112000,
    annualMedian: 107000,
    source: "BLS OEWS",
    sourceDataset: "OEWS-2025-MAY",
    sourceUrl: "https://www.bls.gov/oes/",
    effectiveDate: "2025-05-01",
  },
};

function salary(
  patch: Partial<ProfessionSalary> & Pick<ProfessionSalary, "id" | "role">,
): ProfessionSalary {
  return {
    hourlyMin: 52,
    hourlyMax: 68,
    hourlyMid: 60,
    annual: null,
    source: "Employer posting",
    sourceUrl: "https://example.com/pay",
    effectiveDate: "2025-04-01",
    confidence: null,
    specialty: null,
    ...patch,
  };
}

function pay(
  salaries: ProfessionSalary[],
): HospitalProfessionSalaries {
  return {
    hospitalCcn: "500039",
    profession: {
      id: "prof-rn",
      slug: "registered-nurse",
      name: "Registered Nurse",
      abbreviation: "RN",
    },
    salaries,
  };
}

const workerPay = toWorkerSalarySpecialtyPublicPay([
  {
    specialtySlug: "intensive-care",
    approvedReportCount: 7,
    hourly: {
      count: 7,
      median: 59.25,
      mean: 61.4,
      min: 51,
      max: 73,
    },
    annual: { count: 1, median: 150000, mean: 150000, min: 150000, max: 150000 },
  },
  {
    specialtySlug: "emergency-department",
    approvedReportCount: 4,
    hourly: {
      count: 4,
      median: 44.5,
      mean: 44.5,
      min: 40,
      max: 49,
    },
    annual: { count: 0, median: null, mean: null, min: null, max: null },
  },
  {
    specialtySlug: null,
    approvedReportCount: 1,
    hourly: { count: 1, median: 33, mean: 33, min: 33, max: 33 },
    annual: { count: 0, median: null, mean: null, min: null, max: null },
  },
]);

function section(html: string, name: string, nextName: string | null) {
  const start = html.indexOf(`>${name}<`);
  assert.notEqual(start, -1, name);
  let end = html.length;
  if (nextName) {
    const next = html.indexOf(`>${nextName}<`, start + name.length);
    assert.notEqual(next, -1, nextName);
    end = html.lastIndexOf("<", next);
  }
  return html.slice(start, end);
}

function visibleText(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function workerText(sectionHtml: string) {
  const start = sectionHtml.indexOf(">Worker reported<");
  assert.notEqual(start, -1);
  return visibleText(sectionHtml.slice(start + 1));
}

test("pay by specialty keeps employer rows, benchmark, and public worker pay", () => {
  const html = renderToStaticMarkup(
    <PayBySpecialty
      pay={pay([
        salary({
          id: "general",
          role: "RN",
          hourlyMin: 40,
          hourlyMax: 46,
          hourlyMid: 43,
          specialty: null,
        }),
        salary({
          id: "icu",
          role: "ICU RN",
          specialty: {
            id: "spec-icu",
            slug: "intensive-care",
            name: "Intensive Care",
            abbreviation: "ICU",
          },
        }),
        salary({
          id: "ed",
          role: "ED RN",
          hourlyMin: 70,
          hourlyMax: 80,
          hourlyMid: 75,
          source: "Hospital scale",
          sourceUrl: null,
          effectiveDate: "2025-03-15",
          specialty: {
            id: "spec-ed",
            slug: "emergency-department",
            name: "Emergency Department",
            abbreviation: "ED",
          },
        }),
        salary({
          id: "medsurg",
          role: "Med-Surg RN",
          hourlyMin: 30,
          hourlyMax: 36,
          hourlyMid: 33,
          specialty: {
            id: "spec-medsurg",
            slug: "medical-surgical",
            name: "Medical-Surgical",
            abbreviation: "Med-Surg",
          },
        }),
      ])}
      professionLabel="Registered Nurse"
      localBenchmark={benchmark}
      workerPayBySpecialty={workerPay}
    />,
  );

  assert.equal(html.match(/aria-label="Local RN benchmark"/g)?.length, 1);
  assert.equal(html.match(/\$51\.55\/hr median/g)?.length, 1);
  assert.match(html, /Bremerton-Silverdale-Port Orchard, WA/);
  assert.match(html, /BLS OEWS/);
  assert.match(html, /May 2025/);
  assert.match(html, /not specialty-specific/);

  const generalIndex = html.indexOf(">General / Unspecified<");
  const icuIndex = html.indexOf(">Intensive Care<");
  const edIndex = html.indexOf(">Emergency Department<");
  const medSurgIndex = html.indexOf(">Medical-Surgical<");
  assert.ok(generalIndex < icuIndex);
  assert.ok(icuIndex < edIndex);
  assert.ok(edIndex < medSurgIndex);

  assert.match(html, /Employer posted pay/);
  assert.match(html, /\$52\.00\/hr/);
  assert.match(html, /\$68\.00\/hr/);
  assert.match(html, /Range midpoint/);
  assert.match(html, /\$60\.00\/hr/);
  assert.match(html, /Employer posting/);
  assert.match(html, /https:\/\/example\.com\/pay/);
  assert.match(html, /2025-04-01/);
  assert.match(html, /Hospital scale/);
  assert.match(html, /2025-03-15/);

  const icu = section(html, "Intensive Care", "Emergency Department");
  assert.equal(
    workerText(icu),
    "Worker reported $59.25/hr median 7 approved reports",
  );
  assert.doesNotMatch(icu, /61\.4/);
  assert.doesNotMatch(icu, /\$73/);
  assert.doesNotMatch(icu, /150,000/);
  assert.doesNotMatch(icu, /fraud/i);
  assert.doesNotMatch(icu, /differential/i);
  assert.doesNotMatch(icu, /experienceDate/i);

  const ed = section(html, "Emergency Department", "Medical-Surgical");
  assert.equal(
    workerText(ed),
    `Worker reported ${WORKER_SALARY_PUBLIC_BELOW_THRESHOLD}`,
  );
  assert.doesNotMatch(workerText(ed), /\d/);
  assert.doesNotMatch(ed, /44\.5/);

  const medSurg = section(html, "Medical-Surgical", null);
  assert.equal(
    workerText(medSurg),
    `Worker reported ${WORKER_SALARY_PUBLIC_EMPTY}`,
  );
  assert.doesNotMatch(workerText(medSurg), /\d/);

  const general = section(html, "General / Unspecified", "Intensive Care");
  assert.equal(
    workerText(general),
    `Worker reported ${WORKER_SALARY_PUBLIC_BELOW_THRESHOLD}`,
  );
  assert.doesNotMatch(general, /\$59\.25/);
  assert.doesNotMatch(general, /\$33/);
});

test("employer empty state stays in place when worker aggregates exist", () => {
  const html = renderToStaticMarkup(
    <PayBySpecialty
      pay={pay([])}
      professionLabel="Registered Nurse"
      localBenchmark={benchmark}
      workerPayBySpecialty={workerPay}
    />,
  );

  assert.match(html, /No approved pay data yet for this profession\./);
  assert.equal(html.includes("Worker reported"), false);
  assert.match(html, /Local RN benchmark/);
});

test("public worker markup does not include individual report fields", () => {
  const html = renderToStaticMarkup(
    <PayBySpecialty
      pay={pay([
        salary({
          id: "icu",
          role: "ICU RN",
          specialty: {
            id: "spec-icu",
            slug: "intensive-care",
            name: "Intensive Care",
            abbreviation: "ICU",
          },
        }),
      ])}
      professionLabel="Registered Nurse"
      localBenchmark={null}
      workerPayBySpecialty={workerPay}
    />,
  );

  assert.doesNotMatch(html, /fraud/i);
  assert.doesNotMatch(html, /differential/i);
  assert.doesNotMatch(html, /experienceDate/i);
  assert.doesNotMatch(html, /moderation/i);
  assert.doesNotMatch(html, /reportId/i);
  assert.doesNotMatch(html, /61\.4/);
  assert.doesNotMatch(html, /hourlyMin/i);
  assert.match(html, /\$59\.25\/hr median/);
  assert.match(html, /7 approved reports/);
});
