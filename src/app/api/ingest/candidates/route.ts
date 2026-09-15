import { ingestRequestSchema } from "@/lib/contracts";
import { ingestCandidates, readIngestApiKey } from "@/lib/ingest";
import { jsonError, zodError } from "@/lib/http";

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
  const parsed = ingestRequestSchema.safeParse(body);
  if (!parsed.success) {
    return zodError(parsed.error);
  }

  const result = await ingestCandidates(parsed.data);
  return Response.json(result, { status: 202 });
}
