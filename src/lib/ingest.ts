import { Prisma, type CandidateType } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { IngestRequest } from "@/lib/contracts";

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

export function readIngestApiKey(request: Request) {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  return request.headers.get("x-api-key")?.trim() ?? "";
}
