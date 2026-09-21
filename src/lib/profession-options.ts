export const professionOptions = [
  {
    slug: "registered-nurse",
    label: "Registered Nurse",
    abbreviation: "RN",
    enabled: true,
  },

  // Foundation for future rollout.
  {
    slug: "certified-nursing-assistant",
    label: "CNA / Patient Care Tech",
    abbreviation: "CNA/PCT",
    enabled: false,
  },
  {
    slug: "respiratory-therapist",
    label: "Respiratory Therapist",
    abbreviation: "RT",
    enabled: false,
  },
  {
    slug: "physician",
    label: "Physician",
    abbreviation: "MD/DO",
    enabled: false,
  },
] as const;

export const enabledProfessionOptions = professionOptions.filter(
  (profession) => profession.enabled,
);

export const DEFAULT_PROFESSION_SLUG = "registered-nurse";

export const PROFESSION_STORAGE_KEY = "hospital-compare-profession";

export function getProfessionOption(slug: string | null | undefined) {
  if (!slug) return null;

  return (
    professionOptions.find((profession) => profession.slug === slug) ?? null
  );
}

export function isEnabledProfession(slug: string | null | undefined) {
  const profession = getProfessionOption(slug);
  return Boolean(profession?.enabled);
}
