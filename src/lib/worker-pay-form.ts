import type { ReviewSubmit } from "@/lib/contracts";
import { workerSalaryReportSubmitSchema } from "@/lib/contracts";
import {
  type EmploymentType,
  isEmploymentType,
} from "@/lib/employment-type-options";
import {
  DEFAULT_PROFESSION_SLUG,
  isEnabledProfession,
} from "@/lib/profession-options";
import { specialtyBelongsToProfession } from "@/lib/profession-specialties";
import { buildReviewSubmitPayload } from "@/lib/review-submit";

export const PAY_PRIVACY_COPY =
  "Pay reports are aggregated before public display. Individual pay submissions are not shown publicly.";

export const PAY_REPORT_SUCCESS_MESSAGE = "Pay report submitted for review.";

export const REVIEW_SUCCESS_MESSAGE = "Review submitted successfully.";

export const PAY_REPORT_FAILURE_MESSAGE =
  "Pay report could not be submitted. Please try reporting your pay separately.";

export const REVIEW_FAILURE_MESSAGE =
  "The workplace review could not be submitted. Please try submitting your review separately.";

export const REVIEW_AND_PAY_SUCCESS_MESSAGE = `${REVIEW_SUCCESS_MESSAGE} ${PAY_REPORT_SUCCESS_MESSAGE}`;

export const REVIEW_SUCCESS_PAY_FAILURE_MESSAGE = `${REVIEW_SUCCESS_MESSAGE} ${PAY_REPORT_FAILURE_MESSAGE}`;

export const PAY_SUCCESS_REVIEW_FAILURE_MESSAGE = `${PAY_REPORT_SUCCESS_MESSAGE} ${REVIEW_FAILURE_MESSAGE}`;

export const REVIEW_AND_PAY_FAILURE_MESSAGE =
  "The workplace review could not be submitted. Pay report could not be submitted.";

export const workerPayFieldLabels = {
  profession: "Profession",
  specialty: "Specialty",
  employmentType: "Employment type",
  hourlyRate: "Hourly base pay",
} as const;

/** Fields the pay UI collects. Hidden compensation and moderation fields stay off the payload. */
export const workerPaySubmitKeys = [
  "hospitalCcn",
  "professionSlug",
  "specialtySlug",
  "employmentType",
  "hourlyRate",
] as const;

export type WorkerPayFormState = {
  professionSlug: string;
  specialtySlug: string;
  employmentType: EmploymentType;
  hourlyRate: string;
};

export type WorkerPaySubmitBody = {
  hospitalCcn: string;
  professionSlug: string;
  specialtySlug: string | null;
  employmentType: EmploymentType;
  hourlyRate: number;
};

export function resolveEnabledProfessionSlug(
  professionSlug: string | null | undefined,
): string {
  if (professionSlug && isEnabledProfession(professionSlug)) return professionSlug;
  return DEFAULT_PROFESSION_SLUG;
}

export function initialWorkerPayFormState(
  professionSlug: string | null | undefined,
): WorkerPayFormState {
  return {
    professionSlug: resolveEnabledProfessionSlug(professionSlug),
    specialtySlug: "",
    employmentType: "travel",
    hourlyRate: "",
  };
}

/** Hourly base pay is the signal that the optional review section should be submitted. */
export function isWorkerPayRequested(values: WorkerPayFormState): boolean {
  return values.hourlyRate.trim() !== "";
}

export function buildWorkerSalaryReportPayload(
  hospitalCcn: string,
  values: WorkerPayFormState,
):
  | { ok: true; payload: WorkerPaySubmitBody }
  | { ok: false; error: string } {
  const professionSlug = values.professionSlug.trim();
  if (!isEnabledProfession(professionSlug)) {
    return { ok: false, error: "Select an active profession." };
  }

  if (!isEmploymentType(values.employmentType)) {
    return { ok: false, error: "Select an employment type." };
  }

  const specialtySlug = values.specialtySlug.trim();
  if (
    specialtySlug &&
    !specialtyBelongsToProfession(professionSlug, specialtySlug)
  ) {
    return {
      ok: false,
      error: "Select a specialty for the chosen profession.",
    };
  }

  const hourlyText = values.hourlyRate.trim();
  if (!hourlyText) {
    return { ok: false, error: "Enter hourly base pay." };
  }

  const hourlyRate = Number(hourlyText);
  if (!Number.isFinite(hourlyRate)) {
    return { ok: false, error: "Enter hourly base pay as a number." };
  }
  if (hourlyRate < 0) {
    return { ok: false, error: "Hourly base pay cannot be negative." };
  }

  const candidate = {
    hospitalCcn: hospitalCcn.trim(),
    professionSlug,
    specialtySlug: specialtySlug || null,
    employmentType: values.employmentType,
    hourlyRate,
  };

  const parsed = workerSalaryReportSubmitSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Check the pay fields.",
    };
  }

  if (parsed.data.hourlyRate == null) {
    return { ok: false, error: "Enter hourly base pay." };
  }

  const payload: WorkerPaySubmitBody = {
    hospitalCcn: parsed.data.hospitalCcn,
    professionSlug: parsed.data.professionSlug,
    specialtySlug: parsed.data.specialtySlug ?? null,
    employmentType: parsed.data.employmentType,
    hourlyRate: parsed.data.hourlyRate,
  };

  return { ok: true, payload };
}

type Fetcher = typeof fetch;

async function postJson(
  url: string,
  body: unknown,
  fetcher: Fetcher,
): Promise<
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string }
> {
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> = {};
    try {
      const parsed = (await response.json()) as unknown;
      if (parsed && typeof parsed === "object") {
        data = parsed as Record<string, unknown>;
      }
    } catch {
      data = {};
    }
    if (!response.ok) {
      return {
        ok: false,
        error: typeof data.error === "string" ? data.error : "Submit failed",
      };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Submit failed" };
  }
}

export async function submitStandalonePayForm(
  hospitalCcn: string,
  values: WorkerPayFormState,
  fetcher: Fetcher = fetch,
): Promise<{ ok: boolean; message: string }> {
  const built = buildWorkerSalaryReportPayload(hospitalCcn, values);
  if (!built.ok) return { ok: false, message: built.error };

  const result = await postJson(
    "/api/worker-salary-reports",
    built.payload,
    fetcher,
  );
  if (!result.ok) return { ok: false, message: result.error };
  return { ok: true, message: PAY_REPORT_SUCCESS_MESSAGE };
}

export type ReviewWithOptionalPayInput = {
  hospitalCcn: string;
  body: string;
  employmentType: ReviewSubmit["employmentType"];
  unit: string;
  scores: {
    overallScore?: number;
    staffingScore?: number;
    managementScore?: number;
    payScore?: number;
    wlbScore?: number;
  };
  pay: WorkerPayFormState;
  /**
   * True when this form session already stored the review.
   * A later attempt posts only the salary report.
   */
  skipReview?: boolean;
};

export type ContributionSubmitStatus = "success" | "partial" | "error";

export type ContributionSubmitResult = {
  status: ContributionSubmitStatus;
  message: string;
  reviewSaved: boolean;
  paySaved: boolean;
};

/**
 * Review and pay are separate writes.
 * There is no cross-request transaction: a failed second call is reported as partial success.
 * A review HTTP failure does not skip the salary write. The pay report is still sent,
 * and the message names each result instead of treating the pair as one transaction.
 */
export async function submitReviewWithOptionalPay(
  input: ReviewWithOptionalPayInput,
  fetcher: Fetcher = fetch,
): Promise<ContributionSubmitResult> {
  if (input.skipReview) {
    return submitPayAfterSavedReview(input, fetcher);
  }

  const review = buildReviewSubmitPayload({
    hospitalCcn: input.hospitalCcn,
    body: input.body,
    employmentType: input.employmentType,
    unit: input.unit,
    scores: input.scores,
  });

  let pay: WorkerPaySubmitBody | null = null;
  if (isWorkerPayRequested(input.pay)) {
    const built = buildWorkerSalaryReportPayload(input.hospitalCcn, input.pay);
    if (!built.ok) {
      return {
        status: "error",
        message: built.error,
        reviewSaved: false,
        paySaved: false,
      };
    }
    pay = built.payload;
  }

  const reviewResult = await postJson("/api/reviews", review, fetcher);
  if (!pay) {
    if (reviewResult.ok) {
      const apiMessage = reviewResult.data.message;
      return {
        status: "success",
        message:
          typeof apiMessage === "string" && apiMessage.trim()
            ? apiMessage
            : "Stored as pending.",
        reviewSaved: true,
        paySaved: false,
      };
    }
    return {
      status: "error",
      message: reviewResult.error,
      reviewSaved: false,
      paySaved: false,
    };
  }

  const payResult = await postJson("/api/worker-salary-reports", pay, fetcher);

  if (reviewResult.ok && payResult.ok) {
    return {
      status: "success",
      message: REVIEW_AND_PAY_SUCCESS_MESSAGE,
      reviewSaved: true,
      paySaved: true,
    };
  }
  if (reviewResult.ok && !payResult.ok) {
    return {
      status: "partial",
      message: REVIEW_SUCCESS_PAY_FAILURE_MESSAGE,
      reviewSaved: true,
      paySaved: false,
    };
  }
  if (!reviewResult.ok && payResult.ok) {
    return {
      status: "partial",
      message: PAY_SUCCESS_REVIEW_FAILURE_MESSAGE,
      reviewSaved: false,
      paySaved: true,
    };
  }
  return {
    status: "error",
    message: REVIEW_AND_PAY_FAILURE_MESSAGE,
    reviewSaved: false,
    paySaved: false,
  };
}

async function submitPayAfterSavedReview(
  input: ReviewWithOptionalPayInput,
  fetcher: Fetcher,
): Promise<ContributionSubmitResult> {
  if (!isWorkerPayRequested(input.pay)) {
    return {
      status: "success",
      message: REVIEW_SUCCESS_MESSAGE,
      reviewSaved: true,
      paySaved: false,
    };
  }

  const built = buildWorkerSalaryReportPayload(input.hospitalCcn, input.pay);
  if (!built.ok) {
    return {
      status: "error",
      message: built.error,
      reviewSaved: true,
      paySaved: false,
    };
  }

  const payResult = await postJson(
    "/api/worker-salary-reports",
    built.payload,
    fetcher,
  );
  if (payResult.ok) {
    return {
      status: "success",
      message: PAY_REPORT_SUCCESS_MESSAGE,
      reviewSaved: true,
      paySaved: true,
    };
  }
  return {
    status: "partial",
    message: REVIEW_SUCCESS_PAY_FAILURE_MESSAGE,
    reviewSaved: true,
    paySaved: false,
  };
}
