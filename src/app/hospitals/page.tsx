import { HospitalPicker } from "@/components/hospital-picker";

export const dynamic = "force-dynamic";

export default async function HospitalsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.22em] text-teal-800 uppercase">
          Production directory
        </p>
        <h1 className="font-heading text-3xl sm:text-4xl">Find hospitals by CCN, name, or city</h1>
        <p className="max-w-2xl text-muted-foreground">
          Select two to five facilities, then open a side-by-side compare. Only hospitals that
          already exist in PostgreSQL appear here — staging agent payloads do not.
        </p>
      </div>
      <HospitalPicker initialQuery={q ?? ""} />
    </div>
  );
}
