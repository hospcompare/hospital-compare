import type { ReviewSubmit } from "@/lib/contracts";

export function buildReviewSubmitPayload(input: {
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
}): ReviewSubmit {
  return {
    hospitalCcn: input.hospitalCcn,
    body: input.body,
    employmentType: input.employmentType,
    unit: input.unit || null,
    overallScore: input.scores.overallScore ?? null,
    staffingScore: input.scores.staffingScore ?? null,
    managementScore: input.scores.managementScore ?? null,
    payScore: input.scores.payScore ?? null,
    wlbScore: input.scores.wlbScore ?? null,
  };
}
