import { workplaceReportSubmitSchema } from "@/lib/contracts";
import { submitWorkplaceReport } from "@/lib/queries";
import { jsonError, zodError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("JSON body required", 400);
  }

  const parsed = workplaceReportSubmitSchema.safeParse(body);

  if (!parsed.success) {
    return zodError(parsed.error);
  }

  const result = await submitWorkplaceReport(parsed.data);

  if (!result.ok) {
    return jsonError(result.error, 400);
  }

  return Response.json(
    {
      reportId: result.reportId,
      moderationStatus: result.moderationStatus,
      message:
        "Workplace report stored as pending. It will not affect public workplace data until approved.",
    },
    { status: 201 },
  );
}