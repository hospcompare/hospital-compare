import { jsonError } from "@/lib/http";
import { getWorkerSalaryAggregate } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Approved-only worker pay statistics.
 * Returns the raw aggregate, including samples below the public display
 * minimum. Public pages apply the display policy before rendering.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const hospitalCcn = url.searchParams.get("hospitalCcn")?.trim();
  const professionSlug = url.searchParams.get("professionSlug")?.trim();
  const specialtySlug = url.searchParams.get("specialtySlug")?.trim() || null;

  if (!hospitalCcn) {
    return jsonError("hospitalCcn is required", 400);
  }

  if (!professionSlug) {
    return jsonError("professionSlug is required", 400);
  }

  const aggregate = await getWorkerSalaryAggregate({
    hospitalCcn,
    professionSlug,
    specialtySlug,
  });

  if (!aggregate) {
    return jsonError(
      "Unknown hospital, profession, or specialty selection",
      404,
    );
  }

  return Response.json(aggregate);
}
