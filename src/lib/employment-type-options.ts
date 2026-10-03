import type { ReviewSubmit } from "@/lib/contracts";

export type EmploymentType = ReviewSubmit["employmentType"];

export const employmentTypeOptions = [
  { value: "travel", label: "Travel" },
  { value: "staff", label: "Staff" },
  { value: "per_diem", label: "Per diem" },
  { value: "contract", label: "Local contract" },
  { value: "unknown", label: "Prefer not to say" },
] as const satisfies readonly { value: EmploymentType; label: string }[];

export function isEmploymentType(value: string): value is EmploymentType {
  return employmentTypeOptions.some((option) => option.value === value);
}
