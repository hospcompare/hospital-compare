import { prisma } from "@/lib/db";
import { colAdjustedFrom, formatDate, pickSalaryForRole } from "@/lib/compare";
import type {
  ColIndexMetric,
  HospitalDetail,
  HospitalSummary,
  ReviewAggregate,
  ReviewPublic,
  SalaryMetric,
} from "@/lib/contracts";

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hospitalSummary(hospital: {
  ccn: string;
  name: string;
  city: string;
  state: string;
  zip: string;
  county: string | null;
  hospitalType: string | null;
  traumaLevel: string | null;
  beds: number | null;
  magnetStatus: string | null;
  teachingStatus: string | null;
  ownership: string | null;
  isSeed: boolean;
}): HospitalSummary {
  return {
    ccn: hospital.ccn,
    name: hospital.name,
    city: hospital.city,
    state: hospital.state,
    zip: hospital.zip,
    county: hospital.county,
    hospitalType: hospital.hospitalType,
    traumaLevel: hospital.traumaLevel,
    beds: hospital.beds,
    magnetStatus: hospital.magnetStatus,
    teachingStatus: hospital.teachingStatus,
    ownership: hospital.ownership,
    isSeed: hospital.isSeed,
  };
}

export async function searchHospitals(search: string | undefined, limit = 25) {
  const q = search?.trim();
  const hospitals = await prisma.hospital.findMany({
    where: q
      ? {
          OR: [
            { ccn: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
            { state: { equals: q.toUpperCase() } },
            { zip: { startsWith: q } },
          ],
        }
      : undefined,
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    take: limit,
  });
  return hospitals.map(hospitalSummary);
}

export async function getHospital(ccn: string) {
  return prisma.hospital.findUnique({ where: { ccn } });
}

async function latestColForZip(zip: string): Promise<ColIndexMetric | null> {
  const row = await prisma.colIndex.findFirst({
    where: { locationKey: zip },
    orderBy: { asOfDate: "desc" },
  });
  if (!row) return null;
  return {
    locationKey: row.locationKey,
    keyType: row.keyType,
    indexValue: Number(row.indexValue),
    datasetName: row.datasetName,
    asOfDate: formatDate(row.asOfDate) ?? "",
  };
}

function mapSalary(row: {
  role: string;
  hourlyMin: unknown;
  hourlyMax: unknown;
  annual: unknown;
  source: string;
  sourceUrl: string | null;
  effectiveDate: Date | null;
  confidence: number | null;
}): SalaryMetric {
  const hourlyMin = Number(row.hourlyMin);
  const hourlyMax = Number(row.hourlyMax);
  return {
    role: row.role,
    hourlyMin,
    hourlyMax,
    hourlyMid: (hourlyMin + hourlyMax) / 2,
    annual: toNumber(row.annual),
    source: row.source,
    sourceUrl: row.sourceUrl,
    effectiveDate: formatDate(row.effectiveDate),
    confidence: row.confidence,
  };
}

async function approvedSalaries(ccn: string): Promise<SalaryMetric[]> {
  const rows = await prisma.salary.findMany({
    where: { hospitalCcn: ccn, status: "approved" },
    orderBy: [{ role: "asc" }, { effectiveDate: "desc" }],
  });
  return rows.map(mapSalary);
}

async function reviewAggregates(ccn: string): Promise<ReviewAggregate> {
  const reviews = await prisma.review.findMany({
    where: { hospitalCcn: ccn, moderationStatus: "approved" },
    select: {
      overallScore: true,
      staffingScore: true,
      managementScore: true,
      payScore: true,
      wlbScore: true,
    },
  });

  const avg = (key: keyof (typeof reviews)[number]) => {
    const values = reviews
      .map((row) => row[key])
      .filter((value): value is number => value != null);
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  return {
    approvedCount: reviews.length,
    overall: avg("overallScore"),
    staffing: avg("staffingScore"),
    management: avg("managementScore"),
    pay: avg("payScore"),
    wlb: avg("wlbScore"),
  };
}

export async function getHospitalDetail(
  ccn: string,
): Promise<HospitalDetail | null> {
  const hospital = await prisma.hospital.findUnique({ where: { ccn } });
  if (!hospital) return null;

  const [facts, salaries, col, reviews, quality] = await Promise.all([
    prisma.hospitalFact.findMany({
      where: { hospitalCcn: ccn, status: "approved" },
      orderBy: [{ fieldName: "asc" }, { effectiveDate: "desc" }],
    }),
    approvedSalaries(ccn),
    latestColForZip(hospital.zip),
    reviewAggregates(ccn),
    prisma.cmsQualitySnapshot.findFirst({
      where: { hospitalCcn: ccn },
      orderBy: { releaseDate: "desc" },
    }),
  ]);

  return {
    ...hospitalSummary(hospital),
    address: hospital.address,
    healthSystem: hospital.healthSystem,
    emr: hospital.emr,
    website: hospital.website,
    facts: facts.map((fact) => ({
      fieldName: fact.fieldName,
      value: fact.value,
      source: fact.source,
      sourceUrl: fact.sourceUrl,
      effectiveDate: formatDate(fact.effectiveDate),
      confidence: fact.confidence,
      status: fact.status,
    })),
    salaries,
    col,
    reviews,
    quality: quality
      ? {
          overallRating: quality.overallRating,
          overallRatingFootnote: quality.overallRatingFootnote,
          mortalityMeasureCount: quality.mortalityMeasureCount,
          mortalityBetter: quality.mortalityBetter,
          mortalitySame: quality.mortalitySame,
          mortalityWorse: quality.mortalityWorse,
          safetyMeasureCount: quality.safetyMeasureCount,
          safetyBetter: quality.safetyBetter,
          safetySame: quality.safetySame,
          safetyWorse: quality.safetyWorse,
          readmissionMeasureCount: quality.readmissionMeasureCount,
          readmissionBetter: quality.readmissionBetter,
          readmissionSame: quality.readmissionSame,
          readmissionWorse: quality.readmissionWorse,
          patientExperienceMeasureCount: quality.patientExperienceMeasureCount,
          sourceDataset: quality.sourceDataset,
          sourceUrl: quality.sourceUrl,
          releaseDate: quality.releaseDate.toISOString().slice(0, 10),
        }
      : null,
  };
}

export async function compareHospitals(ccns: string[], role = "Travel RN") {
  const unique = [...new Set(ccns.map((ccn) => ccn.trim()).filter(Boolean))];
  const hospitals = await prisma.hospital.findMany({
    where: { ccn: { in: unique } },
  });
  const byCcn = new Map(hospitals.map((hospital) => [hospital.ccn, hospital]));

  const notes: string[] = [
    "CMS quality measures are from the latest imported CMS release available for each hospital.",
    "Pay, cost-of-living, and review figures appear only from approved records.",
    "COL-adjusted hourly = mid-point hourly ÷ (COL index / 100).",
  ];

  const compared = [];
  for (const ccn of unique) {
    const hospital = byCcn.get(ccn);
    if (!hospital) {
      notes.push(`No production hospital row for CCN ${ccn}.`);
      continue;
    }
    const [salaries, col, reviews, quality] = await Promise.all([
      approvedSalaries(ccn),
      latestColForZip(hospital.zip),
      reviewAggregates(ccn),
      prisma.cmsQualitySnapshot.findFirst({
        where: { hospitalCcn: ccn },
        orderBy: { releaseDate: "desc" },
      }),
    ]);
    const pay = pickSalaryForRole(salaries, role);
    compared.push({
      hospital: hospitalSummary(hospital),
      pay,
      col,
      colAdjustedHourlyMid: colAdjustedFrom(pay, col),
      reviews,
      quality: quality
        ? {
            overallRating: quality.overallRating,
            overallRatingFootnote: quality.overallRatingFootnote,
            mortalityMeasureCount: quality.mortalityMeasureCount,
            mortalityBetter: quality.mortalityBetter,
            mortalitySame: quality.mortalitySame,
            mortalityWorse: quality.mortalityWorse,
            safetyMeasureCount: quality.safetyMeasureCount,
            safetyBetter: quality.safetyBetter,
            safetySame: quality.safetySame,
            safetyWorse: quality.safetyWorse,
            readmissionMeasureCount: quality.readmissionMeasureCount,
            readmissionBetter: quality.readmissionBetter,
            readmissionSame: quality.readmissionSame,
            readmissionWorse: quality.readmissionWorse,
            patientExperienceMeasureCount:
              quality.patientExperienceMeasureCount,
            sourceDataset: quality.sourceDataset,
            sourceUrl: quality.sourceUrl,
            releaseDate: quality.releaseDate.toISOString().slice(0, 10),
          }
        : null,
    });
  }

  return { role, notes, hospitals: compared };
}

export async function listApprovedReviews(
  ccn: string,
): Promise<ReviewPublic[]> {
  const rows = await prisma.review.findMany({
    where: { hospitalCcn: ccn, moderationStatus: "approved" },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    hospitalCcn: row.hospitalCcn,
    body: row.body,
    employmentType: row.employmentType,
    unit: row.unit,
    overallScore: row.overallScore,
    staffingScore: row.staffingScore,
    managementScore: row.managementScore,
    payScore: row.payScore,
    wlbScore: row.wlbScore,
    sentiment: row.sentiment,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function submitReview(input: {
  hospitalCcn: string;
  body: string;
  employmentType: ReviewPublic["employmentType"];
  unit?: string | null;
  overallScore?: number | null;
  staffingScore?: number | null;
  managementScore?: number | null;
  payScore?: number | null;
  wlbScore?: number | null;
}) {
  const hospital = await prisma.hospital.findUnique({
    where: { ccn: input.hospitalCcn },
    select: { ccn: true },
  });
  if (!hospital) {
    return { ok: false as const, error: "Unknown hospital CCN" };
  }

  const review = await prisma.review.create({
    data: {
      hospitalCcn: input.hospitalCcn,
      body: input.body,
      employmentType: input.employmentType,
      unit: input.unit?.trim() || null,
      overallScore: input.overallScore ?? null,
      staffingScore: input.staffingScore ?? null,
      managementScore: input.managementScore ?? null,
      payScore: input.payScore ?? null,
      wlbScore: input.wlbScore ?? null,
      sentiment: null,
      moderationStatus: "pending",
      fraudRiskScore: null,
    },
  });

  // Agent stubs — do not write live UI content from this request.
  // Review Classifier agent: enqueue { reviewId, body } → suggested sentiment + unit tags.
  // Moderation agent: enqueue { reviewId, body } → pending|approved|flagged|rejected.
  // Fraud agent: enqueue { reviewId, metadata } → fraud_risk_score and optional review_flags.
  void review.id;

  return {
    ok: true as const,
    reviewId: review.id,
    moderationStatus: review.moderationStatus,
  };
}
export async function submitWorkplaceReport(input: {
  hospitalCcn: string;
  professionSlug: string;
  specialtySlug?: string | null;
  employmentType: "travel" | "staff" | "per_diem" | "contract" | "unknown";
  experienceMonth?: string | null;
  observations: Array<
    | {
        metricSlug: string;
        numericValue: number;
      }
    | {
        metricSlug: string;
        booleanValue: boolean;
      }
  >;
}) {
  const hospital = await prisma.hospital.findUnique({
    where: { ccn: input.hospitalCcn },
    select: { ccn: true },
  });

  if (!hospital) {
    return { ok: false as const, error: "Unknown hospital CCN" };
  }

  const profession = await prisma.profession.findUnique({
    where: { slug: input.professionSlug },
    select: { id: true, active: true },
  });

  if (!profession || !profession.active) {
    return { ok: false as const, error: "Unknown or inactive profession" };
  }

  let specialtyId: string | null = null;

  if (input.specialtySlug) {
    const specialty = await prisma.specialty.findFirst({
      where: {
        slug: input.specialtySlug,
        professionId: profession.id,
        active: true,
      },
      select: { id: true },
    });

    if (!specialty) {
      return {
        ok: false as const,
        error: "Unknown specialty for selected profession",
      };
    }

    specialtyId = specialty.id;
  }

  const metricSlugs = input.observations.map(
    (observation) => observation.metricSlug,
  );

  const metrics = await prisma.workplaceMetric.findMany({
    where: {
      slug: { in: metricSlugs },
      active: true,
    },
    select: {
      id: true,
      slug: true,
      valueType: true,
    },
  });

  if (metrics.length !== metricSlugs.length) {
    return {
      ok: false as const,
      error: "One or more workplace metrics are unknown or inactive",
    };
  }

  const metricsBySlug = new Map(
    metrics.map((metric) => [metric.slug, metric]),
  );

  for (const observation of input.observations) {
    const metric = metricsBySlug.get(observation.metricSlug);

    if (!metric) {
      return {
        ok: false as const,
        error: `Unknown workplace metric: ${observation.metricSlug}`,
      };
    }

    if ("numericValue" in observation && metric.valueType !== "number") {
      return {
        ok: false as const,
        error: `Metric ${observation.metricSlug} does not accept a numeric value`,
      };
    }

    if ("booleanValue" in observation && metric.valueType !== "boolean") {
      return {
        ok: false as const,
        error: `Metric ${observation.metricSlug} does not accept a boolean value`,
      };
    }

    if (
      observation.metricSlug === "employee-parking-monthly-cost" &&
      "numericValue" in observation &&
      observation.numericValue > 1000
    ) {
      return {
        ok: false as const,
        error: "Monthly parking cost appears invalid",
      };
    }

    if (
      observation.metricSlug === "cafeteria-average-meal-cost" &&
      "numericValue" in observation &&
      observation.numericValue > 100
    ) {
      return {
        ok: false as const,
        error: "Cafeteria meal cost appears invalid",
      };
    }

    if (
      metric.slug.endsWith("satisfaction") ||
      metric.slug === "management-scheduling-accommodation" ||
      metric.slug === "staff-welcoming-new-hires-travelers" ||
      metric.slug === "workplace-security-safety" ||
      metric.slug === "management-support-availability"
    ) {
      if (
        !("numericValue" in observation) ||
        observation.numericValue < 1 ||
        observation.numericValue > 5
      ) {
        return {
          ok: false as const,
          error: `Metric ${observation.metricSlug} must be rated from 1 to 5`,
        };
      }
    }
  }
const typicalAssignment = input.observations.find(
  (observation) =>
    observation.metricSlug === "typical-patient-assignment" &&
    "numericValue" in observation,
);

const highestAssignment = input.observations.find(
  (observation) =>
    observation.metricSlug === "highest-typical-patient-assignment" &&
    "numericValue" in observation,
);

if (
  typicalAssignment &&
  highestAssignment &&
  "numericValue" in typicalAssignment &&
  "numericValue" in highestAssignment &&
  highestAssignment.numericValue < typicalAssignment.numericValue
) {
  return {
    ok: false as const,
    error:
      "Highest patient assignment cannot be lower than the typical patient assignment",
  };
}
  const experienceDate = input.experienceMonth
    ? new Date(`${input.experienceMonth}-01T00:00:00.000Z`)
    : null;

  const report = await prisma.$transaction(async (tx) => {
    const createdReport = await tx.workplaceReport.create({
      data: {
        hospitalCcn: input.hospitalCcn,
        professionId: profession.id,
        specialtyId,
        employmentType: input.employmentType,
        experienceDate,
        moderationStatus: "pending",
        fraudRiskScore: null,
      },
    });

    await tx.workplaceObservation.createMany({
      data: input.observations.map((observation) => {
        const metric = metricsBySlug.get(observation.metricSlug)!;

        return {
          reportId: createdReport.id,
          metricId: metric.id,
          numericValue:
            "numericValue" in observation ? observation.numericValue : null,
          booleanValue:
            "booleanValue" in observation ? observation.booleanValue : null,
          textValue: null,
          optionValue: null,
        };
      }),
    });

    return createdReport;
  });

  return {
    ok: true as const,
    reportId: report.id,
    moderationStatus: report.moderationStatus,
  };
}