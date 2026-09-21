import { Prisma, type CandidateType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { salaryIngestSchema, type IngestRequest } from "@/lib/contracts";

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function ingestCandidates(input: IngestRequest) {
  const accepted: Array<{ type: string; id: string; status: string }> = [];
  const deferred: Array<{ type: string; reason: string }> = [];

  for (const candidate of input.candidates) {
    const candidateType = candidate.type as CandidateType;
    const staging = await prisma.stagingCandidate.create({
      data: {
        sourceAgent: input.sourceAgent,
        candidateType,
        payload: asJson(candidate),
        status: "staging",
      },
    });

    if (candidate.type === "hospital") {
      const row = await prisma.stagingHospital.create({
        data: {
          ccn: candidate.ccn,
          payload: asJson(candidate.payload),
          source: candidate.source,
          sourceUrl: candidate.sourceUrl ?? null,
          status: "staging",
        },
      });
      accepted.push({ type: "hospital", id: row.id, status: "staging" });
      await prisma.stagingCandidate.update({
        where: { id: staging.id },
        data: { processedAt: new Date() },
      });
      continue;
    }

    if (candidate.type === "col_index") {
      // COL rows are reference data; still land in staging_candidates first.
      // A validator should upsert col_indexes. This stub does not auto-promote.
      deferred.push({
        type: "col_index",
        reason: `Stored as staging_candidates.${staging.id}; COL upserts require validation.`,
      });
      continue;
    }

    const hospital = await prisma.hospital.findUnique({
      where: { ccn: candidate.hospitalCcn },
      select: { ccn: true },
    });
    if (!hospital) {
      deferred.push({
        type: candidate.type,
        reason: `No production hospital for CCN ${candidate.hospitalCcn}. Candidate remains in staging_candidates.${staging.id} until a hospital identity is approved.`,
      });
      continue;
    }

    if (candidate.type === "fact") {
      const fact = await prisma.hospitalFact.create({
        data: {
          hospitalCcn: candidate.hospitalCcn,
          fieldName: candidate.fieldName,
          value: candidate.value,
          source: candidate.source,
          sourceUrl: candidate.sourceUrl ?? null,
          effectiveDate: parseDate(candidate.effectiveDate),
          confidence: candidate.confidence ?? null,
          status: "staging",
        },
      });
      accepted.push({ type: "fact", id: fact.id, status: "staging" });
    }

    if (candidate.type === "salary") {
      const salary = await prisma.salary.create({
        data: {
          hospitalCcn: candidate.hospitalCcn,
          role: candidate.role,
          hourlyMin: candidate.hourlyMin,
          hourlyMax: candidate.hourlyMax,
          annual: candidate.annual ?? null,
          source: candidate.source,
          sourceUrl: candidate.sourceUrl ?? null,
          effectiveDate: parseDate(candidate.effectiveDate),
          confidence: candidate.confidence ?? null,
          status: "staging",
        },
      });
      accepted.push({ type: "salary", id: salary.id, status: "staging" });
    }

    await prisma.stagingCandidate.update({
      where: { id: staging.id },
      data: { processedAt: new Date() },
    });
  }

  return {
    acceptedCount: accepted.length,
    deferredCount: deferred.length,
    accepted,
    deferred,
    note: "Candidates are staging-only. A validation worker must set status=approved before Website/API surfaces them.",
  };
}

export type IngestSalaryResult =
  | {
      ok: true;
      id: string;
      status: "staging";
      specialtyId: string | null;
    }
  | {
      ok: false;
      error: string;
      issues?: Array<{ path: string; message: string }>;
    };

function toEffectiveDate(value: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Creates one profession-aware salary row.
 * Status is always staging. Callers cannot choose or override it.
 */
export async function ingestSalaryCandidate(
  input: unknown,
): Promise<IngestSalaryResult> {
  const parsed = salaryIngestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid request",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  const data = parsed.data;
  const hospital = await prisma.hospital.findUnique({
    where: { ccn: data.hospitalCcn },
    select: { ccn: true },
  });
  if (!hospital) {
    return { ok: false, error: "Unknown hospital" };
  }

  const profession = await prisma.profession.findUnique({
    where: { slug: data.professionSlug },
    select: { id: true, active: true },
  });
  if (!profession) {
    return { ok: false, error: "Unknown profession" };
  }
  if (!profession.active) {
    return { ok: false, error: "Profession is not active" };
  }

  let specialtyId: string | null = null;
  if (data.specialtySlug) {
    const matches = await prisma.specialty.findMany({
      where: { slug: data.specialtySlug },
      select: { id: true, professionId: true, active: true },
    });
    const forProfession = matches.find(
      (specialty) => specialty.professionId === profession.id,
    );

    if (!forProfession) {
      if (matches.length > 0) {
        return {
          ok: false,
          error: "Specialty does not belong to the supplied profession",
        };
      }
      return { ok: false, error: "Unknown specialty" };
    }

    if (!forProfession.active) {
      return { ok: false, error: "Specialty is not active" };
    }

    specialtyId = forProfession.id;
  }

  const effectiveDate = data.effectiveDate
    ? toEffectiveDate(data.effectiveDate)
    : null;
  if (data.effectiveDate && !effectiveDate) {
    return { ok: false, error: "effectiveDate must be a valid date" };
  }

  const salary = await prisma.salary.create({
    data: {
      hospitalCcn: hospital.ccn,
      professionId: profession.id,
      specialtyId,
      role: data.role,
      hourlyMin: data.hourlyMin,
      hourlyMax: data.hourlyMax,
      annual: data.annual ?? null,
      source: data.source,
      sourceUrl: data.sourceUrl ?? null,
      effectiveDate,
      confidence: data.confidence ?? null,
      status: "staging",
    },
    select: { id: true, status: true, specialtyId: true },
  });

  if (salary.status !== "staging") {
    await prisma.salary.delete({ where: { id: salary.id } });
    return {
      ok: false,
      error: "Salary candidate was not stored as staging",
    };
  }

  return {
    ok: true,
    id: salary.id,
    status: "staging",
    specialtyId: salary.specialtyId,
  };
}

export function readIngestApiKey(request: Request) {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  return request.headers.get("x-api-key")?.trim() ?? "";
}
