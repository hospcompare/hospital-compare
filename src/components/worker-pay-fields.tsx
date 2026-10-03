"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  employmentTypeOptions,
  isEmploymentType,
} from "@/lib/employment-type-options";
import {
  enabledProfessionOptions,
  isEnabledProfession,
} from "@/lib/profession-options";
import {
  getSpecialtiesForProfession,
  specialtyBelongsToProfession,
} from "@/lib/profession-specialties";
import {
  PAY_PRIVACY_COPY,
  resolveEnabledProfessionSlug,
  workerPayFieldLabels,
  type WorkerPayFormState,
} from "@/lib/worker-pay-form";

const selectClassName =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-70";

export function WorkerPayFields({
  idPrefix,
  values,
  onChange,
  hourlyRequired = false,
}: {
  idPrefix: string;
  values: WorkerPayFormState;
  onChange: (values: WorkerPayFormState) => void;
  hourlyRequired?: boolean;
}) {
  const professionSlug = resolveEnabledProfessionSlug(values.professionSlug);
  const professionLocked = enabledProfessionOptions.length <= 1;
  const specialties = getSpecialtiesForProfession(professionSlug);
  const privacyId = `${idPrefix}-privacy`;

  function updateProfession(nextProfession: string) {
    if (!isEnabledProfession(nextProfession)) return;
    const next = { ...values, professionSlug: nextProfession };
    if (
      next.specialtySlug &&
      !specialtyBelongsToProfession(nextProfession, next.specialtySlug)
    ) {
      next.specialtySlug = "";
    }
    onChange(next);
  }

  function updateSpecialty(nextSpecialty: string) {
    if (
      nextSpecialty &&
      !specialtyBelongsToProfession(professionSlug, nextSpecialty)
    ) {
      return;
    }
    onChange({ ...values, professionSlug, specialtySlug: nextSpecialty });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-profession`}>
            {workerPayFieldLabels.profession}
          </Label>
          <select
            id={`${idPrefix}-profession`}
            className={selectClassName}
            data-pay-field="profession"
            value={professionSlug}
            disabled={professionLocked}
            onChange={(event) => updateProfession(event.target.value)}
          >
            {enabledProfessionOptions.map((profession) => (
              <option key={profession.slug} value={profession.slug}>
                {profession.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-specialty`}>
            {workerPayFieldLabels.specialty}
          </Label>
          <select
            id={`${idPrefix}-specialty`}
            className={selectClassName}
            data-pay-field="specialty"
            value={
              values.specialtySlug &&
              specialtyBelongsToProfession(professionSlug, values.specialtySlug)
                ? values.specialtySlug
                : ""
            }
            onChange={(event) => updateSpecialty(event.target.value)}
          >
            <option value="">No specialty selected</option>
            {specialties.map((specialty) => (
              <option key={specialty.slug} value={specialty.slug}>
                {specialty.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-employment-type`}>
            {workerPayFieldLabels.employmentType}
          </Label>
          <select
            id={`${idPrefix}-employment-type`}
            className={selectClassName}
            data-pay-field="employmentType"
            value={values.employmentType}
            onChange={(event) => {
              const next = event.target.value;
              if (!isEmploymentType(next)) return;
              onChange({ ...values, professionSlug, employmentType: next });
            }}
          >
            {employmentTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-hourly-rate`}>
            {workerPayFieldLabels.hourlyRate}
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <Input
              id={`${idPrefix}-hourly-rate`}
              data-pay-field="hourlyRate"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              required={hourlyRequired}
              aria-describedby={privacyId}
              value={values.hourlyRate}
              placeholder="Base hourly rate"
              onChange={(event) =>
                onChange({
                  ...values,
                  professionSlug,
                  hourlyRate: event.target.value,
                })
              }
            />
          </div>
        </div>
      </div>

      <p id={privacyId} className="text-xs text-muted-foreground">
        {PAY_PRIVACY_COPY}
      </p>
    </div>
  );
}
