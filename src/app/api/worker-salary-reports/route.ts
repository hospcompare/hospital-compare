import { workerSalaryReportSubmitSchema } from "@/lib/contracts";
import { jsonError, zodError } from "@/lib/http";
import { submitWorkerSalaryReport } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError("JSON body required", 400);
  }

  const parsed = workerSalaryReportSubmitSchema.safeParse(body);

  if (!parsed.success) {
    return zodError(parsed.error);
  }

  const result = await submitWorkerSalaryReport(parsed.data);

  if (!result.ok) {
    return jsonError(result.error, result.status);
  }

  return Response.json(
    {
      reportId: result.reportId,
      moderationStatus: result.moderationStatus,
      message:
        "Worker salary report stored as pending. It will not affect pay aggregates until approved.",
    },
    { status: 201 },
  );
}
