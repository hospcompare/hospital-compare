import { compareRequestSchema } from "@/lib/contracts";
import { compareHospitals } from "@/lib/queries";
import { jsonError, zodError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("JSON body required", 400);
  }
  const parsed = compareRequestSchema.safeParse(body);
  if (!parsed.success) {
    return zodError(parsed.error);
  }
  const result = await compareHospitals(parsed.data.ccns, parsed.data.role ?? "Travel RN");
  return Response.json(result);
}
