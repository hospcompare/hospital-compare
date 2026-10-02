import type { ReactNode } from "react";
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
  LocalPayBenchmarkLookup,
  ProfessionSalary,
} from "@/lib/contracts";
import { presentLocalPayBenchmark } from "@/lib/local-pay-benchmark-display";
import {
  formatWorkerSalaryPublicFigure,
  formatWorkerSalaryPublicReportCount,
  workerSalaryPublicDisplayForSpecialty,
  workerSalaryPublicUnavailableMessage,
  type WorkerSalaryPublicDisplay,
  type WorkerSalarySpecialtyPublicPay,
} from "@/lib/worker-salary-public-display";

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

function safeSourceHref(sourceUrl: string | null) {
  if (!sourceUrl?.trim()) return null;
  try {
    const url = new URL(sourceUrl.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function SourceValue({
  source,
  sourceUrl,
}: {
  source: string;
  sourceUrl: string | null;
}) {
  const href = safeSourceHref(sourceUrl);
  if (!href) return source;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words text-teal-800 hover:underline"
    >
      {source}
    </a>
  );
}

function EmployerPostedPay({
  salaries,
}: {
  salaries: readonly ProfessionSalary[];
}) {
  if (salaries.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-muted-foreground">Employer posted pay</p>
        <p className="text-muted-foreground">
          No approved employer pay data yet.
        </p>
      </div>
    );
  }

  return salaries.map((salary, index) => (
    <div
      key={salary.id}
      className={
        index === 0
          ? "space-y-1"
          : "space-y-1 border-t border-foreground/10 pt-3"
      }
    >
      <p className="text-muted-foreground">Employer posted pay</p>
      <Field
        label="Hourly"
        value={`${formatHourly(salary.hourlyMin)} – ${formatHourly(salary.hourlyMax)}`}
      />
      <Field
        label="Range midpoint"
        value={formatHourly(salary.hourlyMid)}
      />
      {salary.annual != null && Number.isFinite(salary.annual) ? (
        <Field label="Annual" value={formatAnnual(salary.annual)} />
      ) : null}
      <Field
        label="Source"
        value={
          <SourceValue source={salary.source} sourceUrl={salary.sourceUrl} />
        }
      />
      <Field label="Effective" value={salary.effectiveDate ?? "—"} />
    </div>
  ));
}

function workerOnlySpecialtyLabel(row: WorkerSalarySpecialtyPublicPay) {
  if (row.specialtySlug == null) return UNSPECIFIED_SPECIALTY;
  const name = row.specialtyName?.trim();
  if (name) return name;
  return row.specialtySlug;
}

type PaySpecialtySection = {
  slug: string | null;
  label: string;
  salaries: ProfessionSalary[];
};

/**
 * One section per specialty. Employer rows keep their incoming order.
 * Worker-only specialties follow afterward, in worker-pay order.
 * A null specialty is General / Unspecified and is not merged with any other.
 */
function paySpecialtySections(
  salaries: readonly ProfessionSalary[],
  workerPay: readonly WorkerSalarySpecialtyPublicPay[],
): PaySpecialtySection[] {
  const sections: PaySpecialtySection[] = [];
  const indexBySlug = new Map<string | null, number>();

  for (const salary of salaries) {
    const slug = salary.specialty?.slug ?? null;
    const existing = indexBySlug.get(slug);
    if (existing == null) {
      indexBySlug.set(slug, sections.length);
      sections.push({
        slug,
        label: specialtyLabel(salary.specialty),
        salaries: [salary],
      });
    } else {
      sections[existing]?.salaries.push(salary);
    }
  }

  for (const worker of workerPay) {
    const slug = worker.specialtySlug ?? null;
    if (indexBySlug.has(slug)) continue;
    indexBySlug.set(slug, sections.length);
    sections.push({
      slug,
      label: workerOnlySpecialtyLabel(worker),
      salaries: [],
    });
  }

  return sections;
}

function WorkerReportedPay({
  display,
}: {
  display: WorkerSalaryPublicDisplay;
}) {
  const unavailable = workerSalaryPublicUnavailableMessage(display);

  return (
    <section
      aria-label="Worker reported"
      className="space-y-1 border-t border-foreground/10 pt-3"
    >
      <p className="font-medium">Worker reported</p>
      {display.state === "eligible" ? (
        <>
          <p className="text-base font-semibold">
            {formatWorkerSalaryPublicFigure(display)}
          </p>
          <p className="text-muted-foreground">
            {formatWorkerSalaryPublicReportCount(display.count)}
          </p>
        </>
      ) : (
        <p className="text-muted-foreground">{unavailable}</p>
      )}
    </section>
  );
}

function LocalMarketBenchmark({
  lookup,
  professionLabel,
}: {
  lookup: LocalPayBenchmarkLookup | null;
  professionLabel: string;
}) {
  const view = presentLocalPayBenchmark(lookup, professionLabel);
  const showAttribution = Boolean(view.source || view.release);

  return (
    <section
      aria-label={view.heading}
      className="space-y-1 border-b border-foreground/10 pb-4"
    >
      <p className="font-medium">{view.heading}</p>
      <p className="text-muted-foreground">{view.context}</p>
      {view.figure ? (
        <p className="text-base font-semibold">{view.figure}</p>
      ) : (
        <p>{view.unavailable}</p>
      )}
      {view.marketName ? <p>{view.marketName}</p> : null}
      {showAttribution ? (
        <p className="text-muted-foreground">
          {view.source}
          {view.source && view.release ? " · " : null}
          {view.release}
        </p>
      ) : null}
    </section>
  );
}

export function PayBySpecialty({
  pay,
  professionLabel,
  localBenchmark,
  workerPayBySpecialty = [],
}: {
  pay: HospitalProfessionSalaries | null;
  professionLabel: string;
  localBenchmark: LocalPayBenchmarkLookup | null;
  workerPayBySpecialty?: readonly WorkerSalarySpecialtyPublicPay[];
}) {
  const rows = pay?.salaries ?? [];
  const sections = paySpecialtySections(rows, workerPayBySpecialty);
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
        <LocalMarketBenchmark
          lookup={localBenchmark}
          professionLabel={label}
        />
        {sections.length === 0 ? (
          <p className="text-muted-foreground">
            No approved pay data yet for this profession.
          </p>
        ) : (
          sections.map((section, index) => (
            <div
              key={section.slug ?? "general-unspecified"}
              className={
                index === 0
                  ? "space-y-1"
                  : "space-y-1 border-t border-foreground/10 pt-4"
              }
            >
              <p className="font-medium">{section.label}</p>
              <EmployerPostedPay salaries={section.salaries} />
              <WorkerReportedPay
                display={workerSalaryPublicDisplayForSpecialty(
                  workerPayBySpecialty,
                  section.slug,
                )}
              />
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
