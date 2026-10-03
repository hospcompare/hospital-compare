export type ProfessionSpecialtyOption = {
  slug: string;
  label: string;
};

/**
 * Specialties belong to one profession.
 * Registered nurse options match the workplace catalog.
 * Any other profession has no selectable specialties until its own list is added.
 */
const specialtiesByProfession: Record<string, readonly ProfessionSpecialtyOption[]> = {
  "registered-nurse": [
    { slug: "emergency-department", label: "Emergency Department" },
    { slug: "intensive-care", label: "Intensive Care" },
    { slug: "medical-surgical", label: "Medical-Surgical" },
    { slug: "telemetry", label: "Telemetry" },
    { slug: "progressive-care", label: "Progressive Care" },
    { slug: "operating-room", label: "Operating Room" },
    { slug: "post-anesthesia-care", label: "Post-Anesthesia Care Unit" },
    { slug: "labor-delivery", label: "Labor & Delivery" },
    { slug: "mother-baby", label: "Mother-Baby/Postpartum" },
    { slug: "neonatal-intensive-care", label: "Neonatal Intensive Care" },
    { slug: "pediatrics", label: "Pediatrics" },
    { slug: "pediatric-intensive-care", label: "Pediatric Intensive Care" },
    { slug: "oncology", label: "Oncology" },
    { slug: "step-down", label: "Step-Down" },
    { slug: "float-pool", label: "Float Pool" },
    { slug: "behavioral-health", label: "Behavioral Health" },
  ],
};

export function getSpecialtiesForProfession(
  professionSlug: string,
): readonly ProfessionSpecialtyOption[] {
  return specialtiesByProfession[professionSlug] ?? [];
}

export function specialtyBelongsToProfession(
  professionSlug: string,
  specialtySlug: string,
): boolean {
  return getSpecialtiesForProfession(professionSlug).some(
    (specialty) => specialty.slug === specialtySlug,
  );
}
