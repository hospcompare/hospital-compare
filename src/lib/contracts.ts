import { z } from "zod";

export const recordStatusSchema = z.enum(["staging", "approved", "rejected"]);
export const moderationStatusSchema = z.enum([
  "pending",
  "approved",
  "flagged",
  "rejected",
]);
export const employmentTypeSchema = z.enum([
  "travel",
  "staff",
  "per_diem",
  "contract",
  "unknown",
]);
export const sentimentSchema = z.enum([
  "positive",
  "mixed",
  "negative",
  "unknown",
]);

export const hospitalSummarySchema = z.object({
  ccn: z.string(),
  name: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string(),
  county: z.string().nullable(),
  hospitalType: z.string().nullable(),
  traumaLevel: z.string().nullable(),
  beds: z.number().int().nullable(),
  magnetStatus: z.string().nullable(),
  teachingStatus: z.string().nullable(),
  ownership: z.string().nullable(),
  isSeed: z.boolean(),
});

export const sourcedFactSchema = z.object({
  fieldName: z.string(),
  value: z.string(),
  source: z.string(),
  sourceUrl: z.string().nullable(),
  effectiveDate: z.string().nullable(),
  confidence: z.number().nullable(),
  status: recordStatusSchema,
});

export const salarySchema = z.object({
  role: z.string(),
  hourlyMin: z.number(),
  hourlyMax: z.number(),
  hourlyMid: z.number(),
  annual: z.number().nullable(),
  source: z.string(),
  sourceUrl: z.string().nullable(),
  effectiveDate: z.string().nullable(),
  confidence: z.number().nullable(),
});

export const colIndexSchema = z.object({
  locationKey: z.string(),
  keyType: z.string(),
  indexValue: z.number(),
  datasetName: z.string(),
  asOfDate: z.string(),
});

export const reviewAggregateSchema = z.object({
  approvedCount: z.number().int(),
  overall: z.number().nullable(),
  staffing: z.number().nullable(),
  management: z.number().nullable(),
  pay: z.number().nullable(),
  wlb: z.number().nullable(),
});

export const hospitalDetailSchema = hospitalSummarySchema.extend({
  address: z.string(),
  healthSystem: z.string().nullable(),
  emr: z.string().nullable(),
  website: z.string().nullable(),
  facts: z.array(sourcedFactSchema),
  salaries: z.array(salarySchema),
  col: colIndexSchema.nullable(),
  reviews: reviewAggregateSchema,
});

export const compareRequestSchema = z.object({
  ccns: z.array(z.string().min(1)).min(1).max(5),
  role: z.string().min(1).optional(),
});

export const compareHospitalSchema = z.object({
  hospital: hospitalSummarySchema,
  pay: salarySchema.nullable(),
  col: colIndexSchema.nullable(),
  colAdjustedHourlyMid: z.number().nullable(),
  reviews: reviewAggregateSchema,
});

export const compareResponseSchema = z.object({
  role: z.string(),
  notes: z.array(z.string()),
  hospitals: z.array(compareHospitalSchema),
});

export const reviewPublicSchema = z.object({
  id: z.string(),
  hospitalCcn: z.string(),
  body: z.string(),
  employmentType: employmentTypeSchema,
  unit: z.string().nullable(),
  overallScore: z.number().int().nullable(),
  staffingScore: z.number().int().nullable(),
  managementScore: z.number().int().nullable(),
  payScore: z.number().int().nullable(),
  wlbScore: z.number().int().nullable(),
  sentiment: sentimentSchema.nullable(),
  createdAt: z.string(),
});

const scoreField = z.number().int().min(1).max(5).optional().nullable();

export const reviewSubmitSchema = z.object({
  hospitalCcn: z.string().min(1),
  body: z.string().trim().min(20).max(4000),
  employmentType: employmentTypeSchema,
  unit: z.string().trim().max(80).optional().nullable(),
  overallScore: scoreField,
  staffingScore: scoreField,
  managementScore: scoreField,
  payScore: scoreField,
  wlbScore: scoreField,
});

export const ingestCandidateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hospital"),
    ccn: z.string().min(1),
    payload: z.record(z.string(), z.unknown()),
    source: z.string().min(1),
    sourceUrl: z.string().url().optional().nullable(),
  }),
  z.object({
    type: z.literal("fact"),
    hospitalCcn: z.string().min(1),
    fieldName: z.string().min(1),
    value: z.string().min(1),
    source: z.string().min(1),
    sourceUrl: z.string().url().optional().nullable(),
    effectiveDate: z.string().optional().nullable(),
    confidence: z.number().min(0).max(1).optional().nullable(),
  }),
  z.object({
    type: z.literal("salary"),
    hospitalCcn: z.string().min(1),
    role: z.string().min(1),
    hourlyMin: z.number().positive(),
    hourlyMax: z.number().positive(),
    annual: z.number().nonnegative().optional().nullable(),
    source: z.string().min(1),
    sourceUrl: z.string().url().optional().nullable(),
    effectiveDate: z.string().optional().nullable(),
    confidence: z.number().min(0).max(1).optional().nullable(),
  }),
  z.object({
    type: z.literal("col_index"),
    locationKey: z.string().min(1),
    keyType: z.enum(["zip", "metro"]),
    indexValue: z.number().positive(),
    datasetName: z.string().min(1),
    asOfDate: z.string().min(1),
  }),
]);

export const ingestRequestSchema = z.object({
  sourceAgent: z.string().min(1),
  candidates: z.array(ingestCandidateSchema).min(1).max(200),
});

export type HospitalSummary = z.infer<typeof hospitalSummarySchema>;
export type HospitalDetail = z.infer<typeof hospitalDetailSchema>;
export type CompareRequest = z.infer<typeof compareRequestSchema>;
export type CompareResponse = z.infer<typeof compareResponseSchema>;
export type ReviewPublic = z.infer<typeof reviewPublicSchema>;
export type ReviewSubmit = z.infer<typeof reviewSubmitSchema>;
export type IngestRequest = z.infer<typeof ingestRequestSchema>;
export type SalaryMetric = z.infer<typeof salarySchema>;
export type ColIndexMetric = z.infer<typeof colIndexSchema>;
export type ReviewAggregate = z.infer<typeof reviewAggregateSchema>;
