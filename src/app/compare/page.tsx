import Link from "next/link";
import { CompareTable } from "@/components/compare-table";
import { compareHospitals } from "@/lib/queries";
import {
  DEFAULT_PROFESSION_SLUG,
  getProfessionOption,
  isEnabledProfession,
} from "@/lib/profession-options";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{
    ccns?: string;
    role?: string;
    profession?: string;
  }>;
}) {
  const params = await searchParams;

  const ccns = (params.ccns ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const selectedProfession = isEnabledProfession(params.profession)
    ? params.profession!
    : DEFAULT_PROFESSION_SLUG;

  const professionOption = getProfessionOption(selectedProfession);

  // Existing salary architecture still uses role strings.
  // RN remains the only enabled profession for this first pass.
  const role = params.role?.trim() || "Travel RN";

  const result =
    ccns.length > 0
      ? await compareHospitals(ccns, role)
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.22em] text-teal-800 uppercase">
          Side-by-side
        </p>

        <h1 className="font-heading text-3xl sm:text-4xl">
          Compare hospitals
        </h1>

        <p className="max-w-2xl text-muted-foreground">
          Comparing hospital information for{" "}
          <span className="font-medium text-foreground">
            {professionOption?.label ?? "your profession"}
          </span>
          . Pay is the approved {role} band when present. COL-adjusted
          mid pay appears only when both an approved salary and a COL
          index exist for that hospital ZIP.
        </p>
      </div>

      {ccns.length === 0 ? (
        <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
          No hospitals selected.{" "}
          <Link
            href={`/hospitals?profession=${encodeURIComponent(
              selectedProfession,
            )}`}
            className="text-teal-800 hover:underline"
          >
            Search hospitals
          </Link>{" "}
          to choose hospitals for comparison.
        </p>
      ) : (
        <CompareTable
          result={result!}
          professionSlug={selectedProfession}
        />
      )}
    </div>
  );
}