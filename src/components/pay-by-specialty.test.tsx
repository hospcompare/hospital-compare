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
    sourceUrl: "https://www.bls.gov/oes/special-requests/oesm25ma.zip",
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

function benchmarkSection(html: string) {
  const start = html.indexOf('aria-label="Local RN benchmark"');
  assert.notEqual(start, -1);
  const end = html.indexOf("</section>", start);
  assert.notEqual(end, -1);
  return html.slice(start, end);
}

const icuSpecialty = {
  id: "spec-icu",
  slug: "intensive-care",
  name: "Intensive Care",
  abbreviation: "ICU",
};

const edSpecialty = {
  id: "spec-ed",
  slug: "emergency-department",
  name: "Emergency Department",
  abbreviation: "ED",
};

const medSurgSpecialty = {
  id: "spec-medsurg",
  slug: "medical-surgical",
  name: "Medical-Surgical",
  abbreviation: "Med-Surg",
};

function workerRows(
  rows: {
    specialtySlug: string | null;
    specialtyName?: string | null;
    hourlyCount: number;
    hourlyMedian: number;
  }[],
) {
  return toWorkerSalarySpecialtyPublicPay(
    rows.map((row) => ({
      specialtySlug: row.specialtySlug,
      specialtyName: row.specialtyName,
      approvedReportCount: row.hourlyCount,
      hourly: {
        count: row.hourlyCount,
        median: row.hourlyMedian,
        mean: 999.99,
        min: 1.11,
        max: 888.88,
      },
      annual: {
        count: 0,
        median: null,
        mean: null,
        min: null,
        max: null,
      },
    })),
  );
}

function renderPay({
  salaries = [],
  worker = workerPay,
  local = benchmark,
}: {
  salaries?: ProfessionSalary[];
  worker?: ReturnType<typeof toWorkerSalarySpecialtyPublicPay>;
  local?: LocalPayBenchmarkLookup | null;
} = {}) {
  return renderToStaticMarkup(
    <PayBySpecialty
      pay={pay(salaries)}
      professionLabel="Registered Nurse"
      localBenchmark={local}
      workerPayBySpecialty={worker}
    />,
  );
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

test("profession-level empty state remains when employer and worker data are both absent", () => {
  const html = renderToStaticMarkup(
    <PayBySpecialty
      pay={pay([])}
      professionLabel="Registered Nurse"
      localBenchmark={benchmark}
      workerPayBySpecialty={[]}
    />,
  );

  assert.match(html, /No approved pay data yet for this profession\./);
  assert.equal(html.includes("Worker reported"), false);
  assert.equal(html.includes("Employer posted pay"), false);
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

const PROFESSION_EMPTY = /No approved pay data yet for this profession\./;
const EMPLOYER_EMPTY = /No approved employer pay data yet\./;

test("1. no employer rows and eligible ICU worker pay renders an ICU section", () => {
  const html = renderPay({
    salaries: [],
    worker: workerRows([
      {
        specialtySlug: "intensive-care",
        specialtyName: "Intensive Care",
        hourlyCount: 5,
        hourlyMedian: 60,
      },
    ]),
  });

  const icu = section(html, "Intensive Care", null);
  assert.match(icu, /Employer posted pay/);
  assert.match(icu, EMPLOYER_EMPTY);
  assert.equal(
    workerText(icu),
    "Worker reported $60.00/hr median 5 approved reports",
  );
  assert.doesNotMatch(icu, /999\.99/);
  assert.doesNotMatch(icu, /888\.88/);
  assert.doesNotMatch(html, PROFESSION_EMPTY);
});

test("2. no employer rows and a low-sample ED worker aggregate renders the low-sample copy", () => {
  const html = renderPay({
    salaries: [],
    worker: workerRows([
      {
        specialtySlug: "emergency-department",
        specialtyName: "Emergency Department",
        hourlyCount: 3,
        hourlyMedian: 44.5,
      },
    ]),
  });

  const ed = section(html, "Emergency Department", null);
  assert.match(ed, EMPLOYER_EMPTY);
  assert.equal(
    workerText(ed),
    `Worker reported ${WORKER_SALARY_PUBLIC_BELOW_THRESHOLD}`,
  );
  assert.doesNotMatch(ed, /44\.5/);
  assert.doesNotMatch(workerText(ed), /\d/);
});

test("3. worker specialty data suppresses the profession-level empty state", () => {
  const html = renderPay({
    salaries: [],
    worker: workerRows([
      {
        specialtySlug: "intensive-care",
        specialtyName: "Intensive Care",
        hourlyCount: 5,
        hourlyMedian: 60,
      },
      {
        specialtySlug: "emergency-department",
        specialtyName: "Emergency Department",
        hourlyCount: 3,
        hourlyMedian: 44.5,
      },
    ]),
  });

  assert.doesNotMatch(html, PROFESSION_EMPTY);
  assert.match(html, />Intensive Care</);
  assert.match(html, />Emergency Department</);
  assert.match(html, /Worker reported/);
});

test("4. an employer-only specialty still renders its posted pay", () => {
  const html = renderPay({
    salaries: [
      salary({
        id: "medsurg",
        role: "Med-Surg RN",
        hourlyMin: 30,
        hourlyMax: 36,
        hourlyMid: 33,
        specialty: medSurgSpecialty,
      }),
    ],
    worker: [],
  });

  const medSurg = section(html, "Medical-Surgical", null);
  assert.match(medSurg, /Employer posted pay/);
  assert.match(medSurg, /\$30\.00\/hr/);
  assert.match(medSurg, /\$36\.00\/hr/);
  assert.match(medSurg, /\$33\.00\/hr/);
  assert.match(medSurg, /Employer posting/);
  assert.match(medSurg, /2025-04-01/);
  assert.doesNotMatch(medSurg, EMPLOYER_EMPTY);
  assert.equal(
    workerText(medSurg),
    `Worker reported ${WORKER_SALARY_PUBLIC_EMPTY}`,
  );
  assert.doesNotMatch(html, PROFESSION_EMPTY);
});

test("5. a specialty with employer and worker data renders both", () => {
  const html = renderPay({
    salaries: [
      salary({
        id: "icu",
        role: "ICU RN",
        specialty: icuSpecialty,
      }),
    ],
    worker: workerRows([
      {
        specialtySlug: "intensive-care",
        specialtyName: "Intensive Care",
        hourlyCount: 7,
        hourlyMedian: 59.25,
      },
    ]),
  });

  const icu = section(html, "Intensive Care", null);
  assert.match(icu, /Employer posted pay/);
  assert.match(icu, /\$52\.00\/hr/);
  assert.match(icu, /\$68\.00\/hr/);
  assert.match(icu, /\$60\.00\/hr/);
  assert.doesNotMatch(icu, EMPLOYER_EMPTY);
  assert.equal(
    workerText(icu),
    "Worker reported $59.25/hr median 7 approved reports",
  );
});

test("6. General / Unspecified worker data stays in its own section", () => {
  const html = renderPay({
    salaries: [
      salary({
        id: "icu",
        role: "ICU RN",
        specialty: icuSpecialty,
      }),
    ],
    worker: workerRows([
      {
        specialtySlug: "intensive-care",
        specialtyName: "Intensive Care",
        hourlyCount: 5,
        hourlyMedian: 60,
      },
      {
        specialtySlug: null,
        hourlyCount: 6,
        hourlyMedian: 33,
      },
    ]),
  });

  const icuIndex = html.indexOf(">Intensive Care<");
  const generalIndex = html.indexOf(">General / Unspecified<");
  assert.ok(icuIndex !== -1 && generalIndex !== -1);
  assert.ok(icuIndex < generalIndex);

  const icu = section(html, "Intensive Care", "General / Unspecified");
  const general = section(html, "General / Unspecified", null);
  assert.equal(
    workerText(icu),
    "Worker reported $60.00/hr median 5 approved reports",
  );
  assert.doesNotMatch(icu, /\$33\.00/);
  assert.match(general, EMPLOYER_EMPTY);
  assert.equal(
    workerText(general),
    "Worker reported $33.00/hr median 6 approved reports",
  );
  assert.doesNotMatch(general, /\$52\.00/);
  assert.doesNotMatch(general, /\$60\.00/);
  assert.equal(html.match(/>General \/ Unspecified</g)?.length, 1);
});

test("7. a worker-only specialty does not inherit another specialty's employer pay", () => {
  const html = renderPay({
    salaries: [
      salary({
        id: "ed",
        role: "ED RN",
        hourlyMin: 70,
        hourlyMax: 80,
        hourlyMid: 75,
        specialty: edSpecialty,
      }),
    ],
    worker: workerRows([
      {
        specialtySlug: "intensive-care",
        specialtyName: "Intensive Care",
        hourlyCount: 5,
        hourlyMedian: 60,
      },
    ]),
  });

  const ed = section(html, "Emergency Department", "Intensive Care");
  const icu = section(html, "Intensive Care", null);
  assert.match(ed, /\$70\.00\/hr/);
  assert.match(ed, /\$80\.00\/hr/);
  assert.doesNotMatch(ed, EMPLOYER_EMPTY);
  assert.equal(
    workerText(ed),
    `Worker reported ${WORKER_SALARY_PUBLIC_EMPTY}`,
  );
  assert.doesNotMatch(ed, /\$60\.00/);
  assert.match(icu, EMPLOYER_EMPTY);
  assert.doesNotMatch(icu, /\$70\.00/);
  assert.doesNotMatch(icu, /\$75\.00/);
  assert.doesNotMatch(icu, /\$80\.00/);
  assert.equal(
    workerText(icu),
    "Worker reported $60.00/hr median 5 approved reports",
  );
});

test("8. an employer-only specialty does not inherit another specialty's worker pay", () => {
  const html = renderPay({
    salaries: [
      salary({
        id: "icu",
        role: "ICU RN",
        specialty: icuSpecialty,
      }),
    ],
    worker: workerRows([
      {
        specialtySlug: "emergency-department",
        specialtyName: "Emergency Department",
        hourlyCount: 5,
        hourlyMedian: 44.5,
      },
    ]),
  });

  const icu = section(html, "Intensive Care", "Emergency Department");
  const ed = section(html, "Emergency Department", null);
  assert.match(icu, /\$52\.00\/hr/);
  assert.match(icu, /\$68\.00\/hr/);
  assert.doesNotMatch(icu, EMPLOYER_EMPTY);
  assert.equal(
    workerText(icu),
    `Worker reported ${WORKER_SALARY_PUBLIC_EMPTY}`,
  );
  assert.doesNotMatch(icu, /44\.5/);
  assert.match(ed, EMPLOYER_EMPTY);
  assert.doesNotMatch(ed, /\$52\.00/);
  assert.doesNotMatch(ed, /\$60\.00/);
  assert.doesNotMatch(ed, /\$68\.00/);
  assert.equal(
    workerText(ed),
    "Worker reported $44.50/hr median 5 approved reports",
  );
});

test("9. the local benchmark still renders once", () => {
  const html = renderPay({
    salaries: [],
    worker: workerRows([
      {
        specialtySlug: "intensive-care",
        specialtyName: "Intensive Care",
        hourlyCount: 5,
        hourlyMedian: 60,
      },
      {
        specialtySlug: "emergency-department",
        specialtyName: "Emergency Department",
        hourlyCount: 3,
        hourlyMedian: 44.5,
      },
    ]),
  });

  assert.equal(html.match(/aria-label="Local RN benchmark"/g)?.length, 1);
  assert.equal(html.match(/\$51\.55\/hr median/g)?.length, 1);
  assert.match(html, /Bremerton-Silverdale-Port Orchard, WA/);
  const benchmarkIndex = html.indexOf('aria-label="Local RN benchmark"');
  const icuIndex = html.indexOf(">Intensive Care<");
  assert.ok(benchmarkIndex !== -1 && benchmarkIndex < icuIndex);
});

test("10. BLS OEWS attribution is plain text, not a link", () => {
  const html = renderPay({
    salaries: [],
    worker: workerRows([
      {
        specialtySlug: "intensive-care",
        specialtyName: "Intensive Care",
        hourlyCount: 5,
        hourlyMedian: 60,
      },
    ]),
  });

  const attribution = benchmarkSection(html);
  assert.doesNotMatch(attribution, /<a\b/);
  assert.doesNotMatch(html, /oesm25ma\.zip/);
  assert.doesNotMatch(html, /<a\b/);
  assert.match(visibleText(attribution), /BLS OEWS · May 2025/);
});

test("11. employer source links stay linked", () => {
  const html = renderPay({
    salaries: [
      salary({
        id: "icu",
        role: "ICU RN",
        source: "Employer posting",
        sourceUrl: "https://example.com/pay",
        specialty: icuSpecialty,
      }),
      salary({
        id: "ed",
        role: "ED RN",
        source: "Hospital scale",
        sourceUrl: null,
        specialty: edSpecialty,
      }),
    ],
    worker: [],
  });

  assert.match(
    html,
    /<a href="https:\/\/example\.com\/pay" target="_blank" rel="noopener noreferrer"[^>]*>Employer posting<\/a>/,
  );
  assert.match(html, />Hospital scale</);
  assert.doesNotMatch(html, /<a[^>]*>Hospital scale<\/a>/);
  assert.doesNotMatch(benchmarkSection(html), /<a\b/);
  assert.doesNotMatch(html, /oesm25ma\.zip/);
});
