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
export const cmsQualitySnapshotSchema = z.object({
  overallRating: z.number().int().min(1).max(5).nullable(),
  overallRatingFootnote: z.string().nullable(),

  mortalityMeasureCount: z.number().int().nullable(),
  mortalityBetter: z.number().int().nullable(),
  mortalitySame: z.number().int().nullable(),
  mortalityWorse: z.number().int().nullable(),

  safetyMeasureCount: z.number().int().nullable(),
  safetyBetter: z.number().int().nullable(),
  safetySame: z.number().int().nullable(),
  safetyWorse: z.number().int().nullable(),

  readmissionMeasureCount: z.number().int().nullable(),
  readmissionBetter: z.number().int().nullable(),
  readmissionSame: z.number().int().nullable(),
  readmissionWorse: z.number().int().nullable(),

  patientExperienceMeasureCount: z.number().int().nullable(),

  sourceDataset: z.string(),
  sourceUrl: z.string().nullable(),
  releaseDate: z.string(),
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
  quality: cmsQualitySnapshotSchema.nullable(),
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
  quality: cmsQualitySnapshotSchema.nullable(),
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
const workplaceNumericObservationSchema = z.object({
  metricSlug: z.string().min(1),
  numericValue: z.number().finite().nonnegative(),
});

const workplaceBooleanObservationSchema = z.object({
  metricSlug: z.string().min(1),
  booleanValue: z.boolean(),
});

export const workplaceReportSubmitSchema = z
  .object({
    hospitalCcn: z.string().min(1),
    professionSlug: z.string().min(1),
    specialtySlug: z.string().min(1).optional().nullable(),
    employmentType: employmentTypeSchema,
    experienceMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional()
      .nullable(),
    observations: z
      .array(
        z.union([
          workplaceNumericObservationSchema,
          workplaceBooleanObservationSchema,
        ]),
      )
      .min(1)
      .max(30),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();

    data.observations.forEach((observation, index) => {
      if (seen.has(observation.metricSlug)) {
        ctx.addIssue({
          code: "custom",
          path: ["observations", index, "metricSlug"],
          message: "Each workplace metric may only be submitted once.",
        });
      }

      seen.add(observation.metricSlug);
    });
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

/**
 * Storage ceilings for the existing Salary decimal columns.
 * Hourly columns are Decimal(8, 2). Annual is Decimal(12, 2).
 * Values that cannot be stored are rejected. These are not wage caps.
 */
function fitsSalaryDecimal(
  value: number,
  precision: number,
  scale: number,
): boolean {
  const factor = 10 ** scale;
  const scaled = Math.round(value * factor);
  return Math.abs(scaled) < 10 ** precision;
}

function salaryDecimalSchema(precision: number, scale: number) {
  return z
    .number()
    .nonnegative()
    .refine((value) => fitsSalaryDecimal(value, precision, scale), {
      message: "exceeds the supported numeric range",
    });
}

const salaryEffectiveDateSchema = z.union([
  z
    .string()
    .trim()
    .pipe(
      z.union([
        z.iso.date(),
        z.iso.datetime({ offset: true, local: true }),
      ]),
    ),
  z.null(),
]);

export const salaryIngestSchema = z
  .object({
    hospitalCcn: z.string().trim().min(1),
    professionSlug: z.string().trim().min(1),
    specialtySlug: z
      .union([z.string(), z.null()])
      .optional()
      .transform((value) => {
        if (value == null) return null;
        const trimmed = value.trim();
        return trimmed.length === 0 ? null : trimmed;
      }),
    role: z.string().trim().min(1),
    hourlyMin: salaryDecimalSchema(8, 2),
    hourlyMax: salaryDecimalSchema(8, 2),
    annual: salaryDecimalSchema(12, 2).nullable().optional(),
    source: z.string().trim().min(1),
    sourceUrl: z
      .union([z.string().trim().pipe(z.httpUrl()), z.null()])
      .optional(),
    effectiveDate: salaryEffectiveDateSchema.optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.hourlyMax < data.hourlyMin) {
      ctx.addIssue({
        code: "custom",
        path: ["hourlyMax"],
        message: "hourlyMax must be greater than or equal to hourlyMin",
      });
    }
  });

export const workplaceMetricAggregateSchema = z.object({
  slug: z.string(),
  label: z.string(),
  category: z.string(),
  valueType: z.enum(["number", "boolean", "text", "option"]),
  unit: z.string().nullable(),

  responseCount: z.number().int().nonnegative(),

  numericAverage: z.number().nullable(),
  numericMin: z.number().nullable(),
  numericMax: z.number().nullable(),

  booleanTrueCount: z.number().int().nonnegative(),
  booleanFalseCount: z.number().int().nonnegative(),
  booleanTruePercent: z.number().nullable(),
});

export const workplaceAggregateSchema = z.object({
  hospitalCcn: z.string(),
  professionSlug: z.string(),
  specialtySlugs: z.array(z.string()),

  approvedReportCount: z.number().int().nonnegative(),

  metrics: z.array(workplaceMetricAggregateSchema),
});

export const professionIdentitySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  abbreviation: z.string().nullable(),
});

export const professionSalarySpecialtySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  abbreviation: z.string().nullable(),
});

export const professionSalarySchema = z.object({
  id: z.string(),
  role: z.string(),
  hourlyMin: z.number(),
  hourlyMax: z.number(),
  hourlyMid: z.number(),
  annual: z.number().nullable(),
  source: z.string(),
  sourceUrl: z.string().nullable(),
  effectiveDate: z.string().nullable(),
  confidence: z.number().nullable(),
  specialty: professionSalarySpecialtySchema.nullable(),
});

export const hospitalProfessionSalariesSchema = z.object({
  hospitalCcn: z.string(),
  profession: professionIdentitySchema,
  salaries: z.array(professionSalarySchema),
});

export const localPayBenchmarkGeographySchema = z.object({
  countyFips: z.string(),
  countyName: z.string(),
  geographicAreaCode: z.string(),
  geographicAreaName: z.string(),
  geographicLevel: z.string(),
});

export const localPayBenchmarkValuesSchema = z.object({
  hourlyMean: z.number().nullable(),
  hourlyMedian: z.number().nullable(),
  annualMean: z.number().nullable(),
  annualMedian: z.number().nullable(),
  source: z.string(),
  sourceDataset: z.string(),
  sourceUrl: z.string().nullable(),
  effectiveDate: z.string().nullable(),
});

/**
 * Known hospital and profession. geography is null until both the Census
 * county resolution and the current OEWS area row exist. benchmark is null
 * when that area has no wage row for the profession and release.
 */
export const localPayBenchmarkLookupSchema = z.object({
  hospitalCcn: z.string(),
  profession: professionIdentitySchema,
  geography: localPayBenchmarkGeographySchema.nullable(),
  benchmark: localPayBenchmarkValuesSchema.nullable(),
});

export type HospitalSummary = z.infer<typeof hospitalSummarySchema>;
export type HospitalDetail = z.infer<typeof hospitalDetailSchema>;
export type CompareRequest = z.infer<typeof compareRequestSchema>;
export type CompareResponse = z.infer<typeof compareResponseSchema>;
export type ReviewPublic = z.infer<typeof reviewPublicSchema>;
export type ReviewSubmit = z.infer<typeof reviewSubmitSchema>;
export type IngestRequest = z.infer<typeof ingestRequestSchema>;
export type SalaryIngestInput = z.infer<typeof salaryIngestSchema>;
export type SalaryMetric = z.infer<typeof salarySchema>;
export type ColIndexMetric = z.infer<typeof colIndexSchema>;
export type ReviewAggregate = z.infer<typeof reviewAggregateSchema>;
export type WorkplaceReportSubmit = z.infer<typeof workplaceReportSubmitSchema>;
export type WorkplaceMetricAggregate = z.infer<typeof workplaceMetricAggregateSchema>;
export type WorkplaceAggregate = z.infer<typeof workplaceAggregateSchema>;
export type ProfessionIdentity = z.infer<typeof professionIdentitySchema>;
export type ProfessionSalarySpecialty = z.infer<typeof professionSalarySpecialtySchema>;
export type ProfessionSalary = z.infer<typeof professionSalarySchema>;
export type HospitalProfessionSalaries = z.infer<typeof hospitalProfessionSalariesSchema>;
export type LocalPayBenchmarkGeography = z.infer<typeof localPayBenchmarkGeographySchema>;
export type LocalPayBenchmarkValues = z.infer<typeof localPayBenchmarkValuesSchema>;
export type LocalPayBenchmarkLookup = z.infer<typeof localPayBenchmarkLookupSchema>;