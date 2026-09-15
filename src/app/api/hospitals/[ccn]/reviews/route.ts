import { listApprovedReviews } from "@/lib/queries";
import { getHospital } from "@/lib/queries";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ ccn: string }> },
) {
  const { ccn } = await context.params;
  const decoded = decodeURIComponent(ccn);
  const hospital = await getHospital(decoded);
  if (!hospital) {
    return jsonError("Hospital not found", 404);
  }
  const reviews = await listApprovedReviews(decoded);
  return Response.json({ reviews, count: reviews.length });
}
