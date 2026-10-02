import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ContributeSection } from "./contribute-section";
import { PayReportForm } from "./pay-report-form";
import { ReviewForm } from "./review-form";
import { WorkplaceReportForm } from "./workplace-report-form";
import { enabledProfessionOptions } from "@/lib/profession-options";
import { getSpecialtiesForProfession } from "@/lib/profession-specialties";
import {
  PAY_PRIVACY_COPY,
  PAY_REPORT_SUCCESS_MESSAGE,
  PAY_SUCCESS_REVIEW_FAILURE_MESSAGE,
  REVIEW_AND_PAY_FAILURE_MESSAGE,
  REVIEW_AND_PAY_SUCCESS_MESSAGE,
  REVIEW_SUCCESS_MESSAGE,
  REVIEW_SUCCESS_PAY_FAILURE_MESSAGE,
  buildWorkerSalaryReportPayload,
  initialWorkerPayFormState,
  submitReviewWithOptionalPay,
  submitStandalonePayForm,
  workerPayFieldLabels,
  workerPaySubmitKeys,
  type WorkerPayFormState,
} from "@/lib/worker-pay-form";

const hospitalCcn = "010001";
const reviewBody =
  "Ratios were usually four patients, with a charge nurse who stayed out of the count.";

function payState(
  patch: Partial<WorkerPayFormState> = {},
): WorkerPayFormState {
  return {
    ...initialWorkerPayFormState("registered-nurse"),
    ...patch,
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function recordFetcher(handler: (url: string, body: unknown) => Response) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url, body });
    return handler(url, body);
  };
  return { calls, fetcher };
}

function fieldValues(html: string, field: string) {
  const match = html.match(
    new RegExp(`data-pay-field="${field}"[\\s\\S]*?</select>`),
  );
  return match?.[0] ?? "";
}

test("standalone pay form renders the four intended fields", () => {
  const html = renderToStaticMarkup(
    <PayReportForm hospitalCcn={hospitalCcn} professionSlug="registered-nurse" />,
  );

  assert.match(html, new RegExp(workerPayFieldLabels.profession));
  assert.match(html, new RegExp(workerPayFieldLabels.specialty));
  assert.match(html, new RegExp(workerPayFieldLabels.employmentType));
  assert.match(html, new RegExp(workerPayFieldLabels.hourlyRate));
  assert.equal(html.match(/data-pay-field="/g)?.length, 4);
  assert.match(html, /id="pay-report-profession"/);
  assert.match(html, /id="pay-report-specialty"/);
  assert.match(html, /id="pay-report-employment-type"/);
  assert.match(html, /id="pay-report-hourly-rate"/);
  assert.match(html, new RegExp(PAY_PRIVACY_COPY));
});

test("hidden backend pay fields are not exposed", () => {
  const html = renderToStaticMarkup(
    <PayReportForm hospitalCcn={hospitalCcn} professionSlug="registered-nurse" />,
  ).toLowerCase();

  const hidden = [
    "shift differential",
    "shiftdifferential",
    "other hourly differential",
    "otherhourlydifferential",
    "annual salary",
    "annualsalary",
    "experience month",
    "experiencemonth",
    "moderation status",
    "moderationstatus",
    "fraud score",
    "fraudriskscore",
  ];

  for (const label of hidden) {
    assert.equal(html.includes(label), false, label);
  }
  assert.equal(html.includes("data-pay-field="), true);
});

test("selected profession defaults to the hospital page profession", () => {
  const html = renderToStaticMarkup(
    <PayReportForm hospitalCcn={hospitalCcn} professionSlug="registered-nurse" />,
  );

  assert.match(html, /Registered Nurse/);
  assert.match(html, /value="registered-nurse"/);
  assert.equal(enabledProfessionOptions.length, 1);
  assert.match(html, /disabled=""/);
  assert.doesNotMatch(html, /certified-nursing-assistant/);
  assert.doesNotMatch(html, /respiratory-therapist/);
  assert.doesNotMatch(html, /value="physician"/);

  const fallback = renderToStaticMarkup(
    <PayReportForm hospitalCcn={hospitalCcn} professionSlug="physician" />,
  );
  assert.match(fallback, /value="registered-nurse"/);
  assert.doesNotMatch(fallback, /value="physician"/);

  const rejected = buildWorkerSalaryReportPayload(
    hospitalCcn,
    payState({ professionSlug: "physician", hourlyRate: "40" }),
  );
  assert.equal(rejected.ok, false);
});

test("specialty list is scoped to the selected profession", () => {
  const rnSpecialties = getSpecialtiesForProfession("registered-nurse");
  const physicianSpecialties = getSpecialtiesForProfession("physician");
  assert.ok(rnSpecialties.some((specialty) => specialty.slug === "intensive-care"));
  assert.equal(physicianSpecialties.length, 0);
  assert.equal(
    physicianSpecialties.some((specialty) =>
      rnSpecialties.some((rn) => rn.slug === specialty.slug),
    ),
    false,
  );

  const html = renderToStaticMarkup(
    <PayReportForm hospitalCcn={hospitalCcn} professionSlug="registered-nurse" />,
  );
  const specialtySelect = fieldValues(html, "specialty");
  assert.match(specialtySelect, /No specialty selected/);
  for (const specialty of rnSpecialties) {
    assert.match(specialtySelect, new RegExp(`value="${specialty.slug}"`));
  }
  assert.doesNotMatch(specialtySelect, /cardiology/);
  assert.doesNotMatch(specialtySelect, /value="physician"/);

  const blank = buildWorkerSalaryReportPayload(
    hospitalCcn,
    payState({ specialtySlug: "", hourlyRate: "44" }),
  );
  assert.equal(blank.ok, true);
  if (blank.ok) assert.equal(blank.payload.specialtySlug, null);

  const crossProfession = buildWorkerSalaryReportPayload(
    hospitalCcn,
    payState({ specialtySlug: "cardiology", hourlyRate: "44" }),
  );
  assert.equal(crossProfession.ok, false);
});

test("valid standalone pay submit posts the worker salary payload", async () => {
  const { calls, fetcher } = recordFetcher(() =>
    jsonResponse(201, { moderationStatus: "pending" }),
  );

  const result = await submitStandalonePayForm(
    hospitalCcn,
    payState({
      specialtySlug: "intensive-care",
      employmentType: "staff",
      hourlyRate: "48.50",
    }),
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.message, PAY_REPORT_SUCCESS_MESSAGE);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "/api/worker-salary-reports");
  assert.deepEqual(calls[0]?.body, {
    hospitalCcn,
    professionSlug: "registered-nurse",
    specialtySlug: "intensive-care",
    employmentType: "staff",
    hourlyRate: 48.5,
  });
});

test("salary submission does not send a moderation status and stays pending", async () => {
  const { calls, fetcher } = recordFetcher(() =>
    jsonResponse(201, {
      moderationStatus: "pending",
      message:
        "Worker salary report stored as pending. It will not affect pay aggregates until approved.",
    }),
  );

  const result = await submitStandalonePayForm(
    hospitalCcn,
    payState({ hourlyRate: "51" }),
    fetcher,
  );

  assert.equal(result.ok, true);
  assert.equal(result.message, PAY_REPORT_SUCCESS_MESSAGE);
  assert.doesNotMatch(result.message, /public/i);
  assert.doesNotMatch(result.message, /approved/i);
  const body = calls[0]?.body ?? {};
  assert.equal("moderationStatus" in body, false);
  assert.equal("fraudRiskScore" in body, false);
  assert.deepEqual(Object.keys(body).sort(), [...workerPaySubmitKeys].sort());
  assert.equal(body.hourlyRate, 51);
  assert.equal(body.specialtySlug, null);
});

test("review can submit without pay", async () => {
  const form = renderToStaticMarkup(
    <ReviewForm hospitalCcn={hospitalCcn} professionSlug="registered-nurse" />,
  );
  assert.match(form, /Pay at this hospital \(optional\)/);
  assert.match(form, /Leave hourly base pay blank/);
  assert.match(form, /id="review-pay-hourly-rate"/);
  assert.doesNotMatch(form, /id="review-pay-hourly-rate"[^>]*required/);

  const { calls, fetcher } = recordFetcher((url) => {
    assert.equal(url, "/api/reviews");
    return jsonResponse(201, {
      moderationStatus: "pending",
      message:
        "Review stored as pending. It will not appear on the hospital page until the moderation pipeline approves it.",
    });
  });

  const result = await submitReviewWithOptionalPay(
    {
      hospitalCcn,
      body: reviewBody,
      employmentType: "travel",
      unit: "ICU",
      scores: { overallScore: 4 },
      pay: payState({ specialtySlug: "intensive-care", hourlyRate: "" }),
    },
    fetcher,
  );

  assert.equal(result.status, "success");
  assert.equal(result.paySaved, false);
  assert.equal(result.reviewSaved, true);
  assert.match(result.message, /pending/i);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "/api/reviews");
  assert.equal("hourlyRate" in (calls[0]?.body ?? {}), false);
});

test("review with completed pay submits a review and a separate salary report", async () => {
  const { calls, fetcher } = recordFetcher((url) =>
    jsonResponse(201, {
      moderationStatus: "pending",
      message: url.endsWith("/reviews") ? "Review stored as pending." : "pending",
    }),
  );

  const result = await submitReviewWithOptionalPay(
    {
      hospitalCcn,
      body: reviewBody,
      employmentType: "travel",
      unit: "ED",
      scores: { payScore: 3 },
      pay: payState({
        specialtySlug: "emergency-department",
        employmentType: "per_diem",
        hourlyRate: "62",
      }),
    },
    fetcher,
  );

  assert.equal(result.status, "success");
  assert.equal(result.message, REVIEW_AND_PAY_SUCCESS_MESSAGE);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, "/api/reviews");
  assert.equal(calls[1]?.url, "/api/worker-salary-reports");
  assert.equal(calls[0]?.body.employmentType, "travel");
  assert.equal(calls[1]?.body.employmentType, "per_diem");
  assert.equal(calls[1]?.body.hourlyRate, 62);
  assert.equal(calls[1]?.body.specialtySlug, "emergency-department");
});

test("review success and salary failure produces partial-success messaging", async () => {
  const { calls, fetcher } = recordFetcher((url) => {
    if (url === "/api/reviews") return jsonResponse(201, { message: "stored" });
    return jsonResponse(500, { error: "database unavailable" });
  });

  const result = await submitReviewWithOptionalPay(
    {
      hospitalCcn,
      body: reviewBody,
      employmentType: "staff",
      unit: "",
      scores: {},
      pay: payState({ hourlyRate: "40" }),
    },
    fetcher,
  );

  assert.equal(result.status, "partial");
  assert.equal(result.reviewSaved, true);
  assert.equal(result.paySaved, false);
  assert.equal(result.message, REVIEW_SUCCESS_PAY_FAILURE_MESSAGE);
  assert.match(result.message, /Review submitted successfully\./);
  assert.match(result.message, /Pay report could not be submitted/);
  assert.equal(calls.length, 2);
});

test("salary retry after a saved review does not post the review again", async () => {
  const failed = recordFetcher(() =>
    jsonResponse(500, { error: "database unavailable" }),
  );
  const retryFailure = await submitReviewWithOptionalPay(
    {
      hospitalCcn,
      body: "",
      employmentType: "staff",
      unit: "",
      scores: {},
      pay: payState({ hourlyRate: "41" }),
      skipReview: true,
    },
    failed.fetcher,
  );
  assert.equal(retryFailure.status, "partial");
  assert.equal(retryFailure.reviewSaved, true);
  assert.equal(retryFailure.paySaved, false);
  assert.equal(retryFailure.message, REVIEW_SUCCESS_PAY_FAILURE_MESSAGE);
  assert.equal(failed.calls.length, 1);
  assert.equal(failed.calls[0]?.url, "/api/worker-salary-reports");

  const recovered = recordFetcher(() =>
    jsonResponse(201, { moderationStatus: "pending" }),
  );
  const retrySuccess = await submitReviewWithOptionalPay(
    {
      hospitalCcn,
      body: "",
      employmentType: "staff",
      unit: "",
      scores: {},
      pay: payState({ hourlyRate: "41" }),
      skipReview: true,
    },
    recovered.fetcher,
  );
  assert.equal(retrySuccess.status, "success");
  assert.equal(retrySuccess.message, PAY_REPORT_SUCCESS_MESSAGE);
  assert.equal(retrySuccess.paySaved, true);
  assert.equal(recovered.calls.length, 1);
  assert.equal(recovered.calls[0]?.url, "/api/worker-salary-reports");
  assert.equal(recovered.calls[0]?.body.hourlyRate, 41);
});

test("salary success and review failure does not claim review success", async () => {
  const { calls, fetcher } = recordFetcher((url) => {
    if (url === "/api/reviews") {
      return jsonResponse(404, { error: "Unknown hospital CCN" });
    }
    return jsonResponse(201, { moderationStatus: "pending" });
  });

  const result = await submitReviewWithOptionalPay(
    {
      hospitalCcn,
      body: reviewBody,
      employmentType: "contract",
      unit: "",
      scores: {},
      pay: payState({ hourlyRate: "70" }),
    },
    fetcher,
  );

  assert.equal(result.status, "partial");
  assert.equal(result.reviewSaved, false);
  assert.equal(result.paySaved, true);
  assert.equal(result.message, PAY_SUCCESS_REVIEW_FAILURE_MESSAGE);
  assert.equal(result.message.includes(REVIEW_SUCCESS_MESSAGE), false);
  assert.match(result.message, /Pay report submitted for review\./);
  assert.match(result.message, /workplace review could not be submitted/i);
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.url, "/api/reviews");
  assert.equal(calls[1]?.url, "/api/worker-salary-reports");
});

test("review payload does not include salary data", async () => {
  const { calls, fetcher } = recordFetcher(() =>
    jsonResponse(201, { message: "Review stored as pending." }),
  );

  await submitReviewWithOptionalPay(
    {
      hospitalCcn,
      body: reviewBody,
      employmentType: "travel",
      unit: "OR",
      scores: { overallScore: 5, staffingScore: 4 },
      pay: payState({
        specialtySlug: "operating-room",
        employmentType: "staff",
        hourlyRate: "80",
      }),
    },
    fetcher,
  );

  const review = calls[0]?.body ?? {};
  const salaryKeys = [
    "professionSlug",
    "specialtySlug",
    "hourlyRate",
    "shiftDifferential",
    "otherHourlyDifferential",
    "annualSalary",
    "experienceMonth",
    "moderationStatus",
    "fraudRiskScore",
  ];
  for (const key of salaryKeys) {
    assert.equal(key in review, false, key);
  }
  assert.equal(review.body, reviewBody);
  assert.equal(review.employmentType, "travel");
  assert.equal(review.unit, "OR");
  assert.equal(review.overallScore, 5);
  assert.deepEqual(Object.keys(review).sort(), [
    "body",
    "employmentType",
    "hospitalCcn",
    "managementScore",
    "overallScore",
    "payScore",
    "staffingScore",
    "unit",
    "wlbScore",
  ]);
});

test("worker salary payload does not include review data", async () => {
  const { calls, fetcher } = recordFetcher(() =>
    jsonResponse(201, { moderationStatus: "pending" }),
  );

  await submitReviewWithOptionalPay(
    {
      hospitalCcn,
      body: reviewBody,
      employmentType: "travel",
      unit: "NICU",
      scores: { wlbScore: 2, payScore: 4 },
      pay: payState({
        specialtySlug: "neonatal-intensive-care",
        employmentType: "contract",
        hourlyRate: "66.25",
      }),
    },
    fetcher,
  );

  const salary = calls[1]?.body ?? {};
  const reviewKeys = [
    "body",
    "unit",
    "overallScore",
    "staffingScore",
    "managementScore",
    "payScore",
    "wlbScore",
    "sentiment",
  ];
  for (const key of reviewKeys) {
    assert.equal(key in salary, false, key);
  }
  assert.deepEqual(salary, {
    hospitalCcn,
    professionSlug: "registered-nurse",
    specialtySlug: "neonatal-intensive-care",
    employmentType: "contract",
    hourlyRate: 66.25,
  });
  assert.equal(calls[0]?.body.body, reviewBody);
  assert.equal(calls[0]?.body.unit, "NICU");
});

test("both failed writes do not claim success", async () => {
  const { fetcher } = recordFetcher((url) =>
    jsonResponse(url === "/api/reviews" ? 404 : 400, { error: "nope" }),
  );
  const result = await submitReviewWithOptionalPay(
    {
      hospitalCcn,
      body: reviewBody,
      employmentType: "unknown",
      unit: "",
      scores: {},
      pay: payState({ hourlyRate: "33" }),
    },
    fetcher,
  );
  assert.equal(result.status, "error");
  assert.equal(result.message, REVIEW_AND_PAY_FAILURE_MESSAGE);
  assert.equal(result.message.includes("successfully"), false);
  assert.equal(result.reviewSaved, false);
  assert.equal(result.paySaved, false);
});

test("contribute section keeps the workplace details entry point", () => {
  const html = renderToStaticMarkup(
    <ContributeSection
      hospitalCcn={hospitalCcn}
      professionSlug="registered-nurse"
    />,
  );

  assert.match(html, /Contribute/);
  assert.match(html, /Help other healthcare workers by sharing your experience\./);
  assert.match(html, /Write a workplace review/);
  assert.match(html, /Report your pay/);
  assert.match(html, /Share workplace details/);

  const workplace = renderToStaticMarkup(
    <WorkplaceReportForm
      hospitalCcn={hospitalCcn}
      professionSlug="registered-nurse"
    />,
  );
  assert.match(workplace, /Submit workplace report/);
  assert.match(workplace, /Typical patient assignment/);
  assert.match(workplace, /value="intensive-care"/);
  assert.match(workplace, /Emergency Department/);
});
