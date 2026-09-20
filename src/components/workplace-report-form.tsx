"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WorkplaceReportSubmit } from "@/lib/contracts";

const employmentOptions = [
  { value: "travel", label: "Travel" },
  { value: "staff", label: "Staff" },
  { value: "per_diem", label: "Per diem" },
  { value: "contract", label: "Local contract" },
  { value: "unknown", label: "Prefer not to say" },
] as const;

const rnSpecialties = [
  { value: "", label: "No specialty selected" },
  { value: "emergency-department", label: "Emergency Department" },
  { value: "intensive-care", label: "Intensive Care" },
  { value: "medical-surgical", label: "Medical-Surgical" },
  { value: "telemetry", label: "Telemetry" },
  { value: "progressive-care", label: "Progressive Care" },
  { value: "operating-room", label: "Operating Room" },
  { value: "post-anesthesia-care", label: "Post-Anesthesia Care Unit" },
  { value: "labor-delivery", label: "Labor & Delivery" },
  { value: "mother-baby", label: "Mother-Baby/Postpartum" },
  { value: "neonatal-intensive-care", label: "Neonatal Intensive Care" },
  { value: "pediatrics", label: "Pediatrics" },
  { value: "pediatric-intensive-care", label: "Pediatric Intensive Care" },
  { value: "oncology", label: "Oncology" },
  { value: "step-down", label: "Step-Down" },
  { value: "float-pool", label: "Float Pool" },
  { value: "behavioral-health", label: "Behavioral Health" },
] as const;

type EmploymentType = WorkplaceReportSubmit["employmentType"];

type NumericAnswers = Record<string, string>;
type BooleanAnswers = Record<string, "yes" | "no" | "">;

const ratingOptions = [1, 2, 3, 4, 5];

export function WorkplaceReportForm({
  hospitalCcn,
}: {
  hospitalCcn: string;
}) {
  const [employmentType, setEmploymentType] =
    useState<EmploymentType>("travel");
  const [specialtySlug, setSpecialtySlug] = useState("");
  const [experienceMonth, setExperienceMonth] = useState("");

  const [numericAnswers, setNumericAnswers] = useState<NumericAnswers>({});
  const [booleanAnswers, setBooleanAnswers] = useState<BooleanAnswers>({});

  const [status, setStatus] = useState<
    "idle" | "saving" | "done" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  function setNumeric(metricSlug: string, value: string) {
    setNumericAnswers((current) => ({
      ...current,
      [metricSlug]: value,
    }));
  }

  function setBoolean(
    metricSlug: string,
    value: "yes" | "no" | "",
  ) {
    setBooleanAnswers((current) => ({
      ...current,
      [metricSlug]: value,
    }));
  }

  function addNumericObservation(
    observations: WorkplaceReportSubmit["observations"],
    metricSlug: string,
  ) {
    const raw = numericAnswers[metricSlug];

    if (raw === undefined || raw === "") return;

    observations.push({
      metricSlug,
      numericValue: Number(raw),
    });
  }

  function addBooleanObservation(
    observations: WorkplaceReportSubmit["observations"],
    metricSlug: string,
  ) {
    const raw = booleanAnswers[metricSlug];

    if (!raw) return;

    observations.push({
      metricSlug,
      booleanValue: raw === "yes",
    });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setMessage(null);

    const observations: WorkplaceReportSubmit["observations"] = [];

    addNumericObservation(observations, "typical-patient-assignment");
    addNumericObservation(
      observations,
      "highest-typical-patient-assignment",
    );

    addBooleanObservation(
      observations,
      "charge-nurse-takes-patient-assignment",
    );
    addBooleanObservation(
      observations,
      "dedicated-break-coverage-available",
    );
    addBooleanObservation(
      observations,
      "adequate-cna-tech-support",
    );

    addNumericObservation(
      observations,
      "management-scheduling-accommodation",
    );

    addNumericObservation(
      observations,
      "overall-benefits-satisfaction",
    );
    addBooleanObservation(
      observations,
      "retirement-employer-contribution",
    );
    addBooleanObservation(
      observations,
      "tuition-continuing-education-assistance",
    );

    addNumericObservation(
      observations,
      "staff-welcoming-new-hires-travelers",
    );
    addNumericObservation(
      observations,
      "employee-parking-monthly-cost",
    );
    addNumericObservation(
      observations,
      "workplace-security-safety",
    );
    addNumericObservation(
      observations,
      "cafeteria-average-meal-cost",
    );
    addNumericObservation(
      observations,
      "management-support-availability",
    );

    if (observations.length === 0) {
      setStatus("error");
      setMessage("Please answer at least one workplace question.");
      return;
    }

    const payload: WorkplaceReportSubmit = {
      hospitalCcn,
      professionSlug: "registered-nurse",
      specialtySlug: specialtySlug || null,
      employmentType,
      experienceMonth: experienceMonth || null,
      observations,
    };

    try {
      const response = await fetch("/api/workplace-reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Submit failed");
      }

      setStatus("done");
      setMessage(
        data.message ?? "Workplace report stored as pending.",
      );

      setSpecialtySlug("");
      setExperienceMonth("");
      setNumericAnswers({});
      setBooleanAnswers({});
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Submit failed",
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="workplaceEmploymentType">
            Employment type
          </Label>
          <select
            id="workplaceEmploymentType"
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={employmentType}
            onChange={(event) =>
              setEmploymentType(event.target.value as EmploymentType)
            }
          >
            {employmentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="specialty">RN specialty</Label>
          <select
            id="specialty"
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={specialtySlug}
            onChange={(event) => setSpecialtySlug(event.target.value)}
          >
            {rnSpecialties.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="experienceMonth">
            When did you work there?
          </Label>
          <Input
            id="experienceMonth"
            type="month"
            value={experienceMonth}
            onChange={(event) => setExperienceMonth(event.target.value)}
          />
        </div>
      </div>

      <fieldset className="space-y-4">
        <legend className="font-medium">Workload & Staffing</legend>

        <NumberQuestion
          label="Typical patient assignment"
          value={numericAnswers["typical-patient-assignment"] ?? ""}
          onChange={(value) =>
            setNumeric("typical-patient-assignment", value)
          }
        />

        <NumberQuestion
          label="Highest patient assignment typically encountered"
          value={
            numericAnswers["highest-typical-patient-assignment"] ?? ""
          }
          onChange={(value) =>
            setNumeric("highest-typical-patient-assignment", value)
          }
        />

        <BooleanQuestion
          label="Does the charge nurse usually take a patient assignment?"
          value={
            booleanAnswers[
              "charge-nurse-takes-patient-assignment"
            ] ?? ""
          }
          onChange={(value) =>
            setBoolean(
              "charge-nurse-takes-patient-assignment",
              value,
            )
          }
        />

        <BooleanQuestion
          label="Is dedicated break or relief coverage usually available?"
          value={
            booleanAnswers["dedicated-break-coverage-available"] ?? ""
          }
          onChange={(value) =>
            setBoolean("dedicated-break-coverage-available", value)
          }
        />

        <BooleanQuestion
          label="Is adequate CNA or tech support usually available when applicable?"
          value={booleanAnswers["adequate-cna-tech-support"] ?? ""}
          onChange={(value) =>
            setBoolean("adequate-cna-tech-support", value)
          }
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-medium">
          Schedule & Flexibility
        </legend>

        <RatingQuestion
          label="How accommodating is management with your scheduling needs?"
          value={
            numericAnswers[
              "management-scheduling-accommodation"
            ] ?? ""
          }
          onChange={(value) =>
            setNumeric(
              "management-scheduling-accommodation",
              value,
            )
          }
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-medium">Benefits</legend>

        <RatingQuestion
          label="How satisfied are you with your overall benefits package?"
          value={
            numericAnswers["overall-benefits-satisfaction"] ?? ""
          }
          onChange={(value) =>
            setNumeric("overall-benefits-satisfaction", value)
          }
        />

        <BooleanQuestion
          label="Does the employer offer a retirement match or employer retirement contribution?"
          value={
            booleanAnswers["retirement-employer-contribution"] ?? ""
          }
          onChange={(value) =>
            setBoolean("retirement-employer-contribution", value)
          }
        />

        <BooleanQuestion
          label="Does the employer offer tuition or continuing-education assistance?"
          value={
            booleanAnswers[
              "tuition-continuing-education-assistance"
            ] ?? ""
          }
          onChange={(value) =>
            setBoolean(
              "tuition-continuing-education-assistance",
              value,
            )
          }
        />
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="font-medium">Practical Workplace</legend>

        <RatingQuestion
          label="How welcoming are staff toward new hires and travelers?"
          value={
            numericAnswers[
              "staff-welcoming-new-hires-travelers"
            ] ?? ""
          }
          onChange={(value) =>
            setNumeric(
              "staff-welcoming-new-hires-travelers",
              value,
            )
          }
        />

        <NumberQuestion
          label="What is your typical employee parking cost per month?"
          helper="Enter 0 if employee parking is free."
          prefix="$"
          step="0.01"
          value={
            numericAnswers["employee-parking-monthly-cost"] ?? ""
          }
          onChange={(value) =>
            setNumeric("employee-parking-monthly-cost", value)
          }
        />

        <RatingQuestion
          label="How safe and secure do you feel at the workplace?"
          value={
            numericAnswers["workplace-security-safety"] ?? ""
          }
          onChange={(value) =>
            setNumeric("workplace-security-safety", value)
          }
        />

        <NumberQuestion
          label="What is the average cost of a cafeteria meal?"
          prefix="$"
          step="0.01"
          value={
            numericAnswers["cafeteria-average-meal-cost"] ?? ""
          }
          onChange={(value) =>
            setNumeric("cafeteria-average-meal-cost", value)
          }
        />

        <RatingQuestion
          label="How available and supportive is management when issues arise?"
          value={
            numericAnswers[
              "management-support-availability"
            ] ?? ""
          }
          onChange={(value) =>
            setNumeric(
              "management-support-availability",
              value,
            )
          }
        />
      </fieldset>

      <p className="text-xs text-muted-foreground">
        Questions may be skipped when you are unsure or when they do
        not apply. Submitted workplace data remains pending until
        moderation.
      </p>

      {message ? (
        <p
          className={
            status === "error"
              ? "text-sm text-destructive"
              : "text-sm text-teal-800"
          }
        >
          {message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={status === "saving"}
        className="bg-teal-800 text-teal-50 hover:bg-teal-700"
      >
        {status === "saving"
          ? "Submitting..."
          : "Submit workplace report"}
      </Button>
    </form>
  );
}

function NumberQuestion({
  label,
  helper,
  prefix,
  step = "1",
  value,
  onChange,
}: {
  label: string;
  helper?: string;
  prefix?: string;
  step?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex max-w-xs items-center gap-2">
        {prefix ? (
          <span className="text-sm text-muted-foreground">{prefix}</span>
        ) : null}
        <Input
          type="number"
          min="0"
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {helper ? (
        <p className="text-xs text-muted-foreground">{helper}</p>
      ) : null}
    </div>
  );
}

function BooleanQuestion({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "yes" | "no" | "";
  onChange: (value: "yes" | "no" | "") => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
      <Label>{label}</Label>
      <select
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        value={value}
        onChange={(event) =>
          onChange(event.target.value as "yes" | "no" | "")
        }
      >
        <option value="">Skip / unsure</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </div>
  );
}

function RatingQuestion({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
      <Label>{label}</Label>
      <select
        className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Skip</option>
        {ratingOptions.map((rating) => (
          <option key={rating} value={rating}>
            {rating}
          </option>
        ))}
      </select>
    </div>
  );
}