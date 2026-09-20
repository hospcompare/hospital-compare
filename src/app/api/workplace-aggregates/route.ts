import { getWorkplaceAggregate } from "@/lib/queries";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const hospitalCcn = url.searchParams.get("hospitalCcn")?.trim();
  const professionSlug = url.searchParams.get("professionSlug")?.trim();

  const specialtySlugs = url.searchParams
    .getAll("specialty")
    .map((slug) => slug.trim())
    .filter(Boolean);

  if (!hospitalCcn) {
    return jsonError("hospitalCcn is required", 400);
  }

  if (!professionSlug) {
    return jsonError("professionSlug is required", 400);
  }

  const aggregate = await getWorkplaceAggregate({
    hospitalCcn,
    professionSlug,
    specialtySlugs,
  });

  if (!aggregate) {
    return jsonError(
      "Unknown hospital, profession, or specialty selection",
      404,
    );
  }

  return Response.json(aggregate);
}