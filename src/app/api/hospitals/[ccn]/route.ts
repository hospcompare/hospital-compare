import { getHospitalDetail } from "@/lib/queries";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ ccn: string }> },
) {
  const { ccn } = await context.params;
  const hospital = await getHospitalDetail(decodeURIComponent(ccn));
  if (!hospital) {
    return jsonError("Hospital not found", 404);
  }
  return Response.json({ hospital });
}
