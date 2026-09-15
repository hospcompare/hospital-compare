import { searchHospitals } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? undefined;
  const hospitals = await searchHospitals(search);
  return Response.json({ hospitals, count: hospitals.length });
}
