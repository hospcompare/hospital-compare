import { getLocalPayBenchmarkForHospitalProfession } from "@/lib/queries";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hospitalCcn = url.searchParams.get("hospitalCcn")?.trim();
  const professionSlug = url.searchParams.get("professionSlug")?.trim();

  if (!hospitalCcn) {
    return jsonError("hospitalCcn is required", 400);
  }

  if (!professionSlug) {
    return jsonError("professionSlug is required", 400);
  }

  const result = await getLocalPayBenchmarkForHospitalProfession({
    hospitalCcn,
    professionSlug,
  });

  if (!result) {
    return jsonError("Unknown hospital or profession", 404);
  }

  return Response.json(result);
}
