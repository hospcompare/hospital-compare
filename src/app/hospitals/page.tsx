import { HospitalPicker } from "@/components/hospital-picker";
import { ProfessionSelector } from "@/components/profession-selector";
import {
  DEFAULT_PROFESSION_SLUG,
  getProfessionOption,
  isEnabledProfession,
} from "@/lib/profession-options";

export const dynamic = "force-dynamic";

export default async function HospitalsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    profession?: string;
  }>;
}) {
  const { q, profession } = await searchParams;

  const selectedProfession = isEnabledProfession(profession)
    ? profession!
    : DEFAULT_PROFESSION_SLUG;

  const professionOption = getProfessionOption(selectedProfession);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.22em] text-teal-800 uppercase">
          Production directory
        </p>

        <h1 className="font-heading text-3xl sm:text-4xl">
          Find hospitals by CCN, name, or city
        </h1>

        <p className="max-w-2xl text-muted-foreground">
          Search hospital data for{" "}
          <span className="font-medium text-foreground">
            {professionOption?.label ?? "your profession"}
          </span>
          . Select two to five facilities to compare.
        </p>
      </div>

      <div className="max-w-sm">
        <ProfessionSelector
          initialProfession={selectedProfession}
        />
      </div>

      <HospitalPicker
        initialQuery={q ?? ""}
        professionSlug={selectedProfession}
      />
    </div>
  );
}