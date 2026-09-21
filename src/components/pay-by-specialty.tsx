import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatHourly } from "@/lib/compare";
import type {
  HospitalProfessionSalaries,
  ProfessionSalary,
} from "@/lib/contracts";

const UNSPECIFIED_SPECIALTY = "General / Unspecified";

function specialtyLabel(specialty: ProfessionSalary["specialty"]) {
  if (!specialty) return UNSPECIFIED_SPECIALTY;
  const name = specialty.name.trim();
  if (name) return name;
  const abbreviation = specialty.abbreviation?.trim();
  if (abbreviation) return abbreviation;
  const slug = specialty.slug.trim();
  return slug || UNSPECIFIED_SPECIALTY;
}

function formatAnnual(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatConfidence(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export function PayBySpecialty({
  pay,
  professionLabel,
}: {
  pay: HospitalProfessionSalaries | null;
  professionLabel: string;
}) {
  const rows = pay?.salaries ?? [];
  const label = pay?.profession.name || professionLabel;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pay by Specialty</CardTitle>
        <CardDescription>
          Approved pay for {label}. Staging salary candidates are omitted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">
            No approved pay data yet for this profession.
          </p>
        ) : (
          rows.map((salary, index) => {
            const confidence = formatConfidence(salary.confidence);
            return (
              <div
                key={salary.id}
                className={
                  index === 0
                    ? "space-y-1"
                    : "space-y-1 border-t border-foreground/10 pt-4"
                }
              >
                <p className="font-medium">{specialtyLabel(salary.specialty)}</p>
                <Field
                  label="Hourly"
                  value={`${formatHourly(salary.hourlyMin)} – ${formatHourly(salary.hourlyMax)}`}
                />
                <Field
                  label="Midpoint"
                  value={formatHourly(salary.hourlyMid)}
                />
                {salary.annual != null && Number.isFinite(salary.annual) ? (
                  <Field label="Annual" value={formatAnnual(salary.annual)} />
                ) : null}
                <Field label="Source" value={salary.source} />
                <Field
                  label="Effective"
                  value={salary.effectiveDate ?? "—"}
                />
                {confidence != null ? (
                  <Field label="Confidence" value={confidence} />
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
