import { ingestSalaryCandidate, readIngestApiKey } from "@/lib/ingest";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expected = process.env.INGEST_API_KEY;
  if (!expected) {
    return jsonError("INGEST_API_KEY is not configured", 500);
  }
  const provided = readIngestApiKey(request);
  if (!provided || provided !== expected) {
    return jsonError("Unauthorized", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("JSON body required", 400);
  }

  let result: Awaited<ReturnType<typeof ingestSalaryCandidate>>;
  try {
    result = await ingestSalaryCandidate(body);
  } catch {
    return jsonError("Unable to store salary candidate", 500);
  }

  if (!result.ok) {
    return jsonError(
      result.error,
      400,
      result.issues ? { issues: result.issues } : undefined,
    );
  }

  return Response.json(
    {
      id: result.id,
      status: result.status,
      specialtyId: result.specialtyId,
    },
    { status: 201 },
  );
}
