import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  WorkplaceAggregate,
  WorkplaceMetricAggregate,
} from "@/lib/contracts";

const CATEGORY_ORDER = [
  "workload_staffing",
  "schedule_flexibility",
  "benefits",
  "practical_workplace",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  workload_staffing: "Workload & Staffing",
  schedule_flexibility: "Schedule & Flexibility",
  benefits: "Benefits",
  practical_workplace: "Practical Workplace",
};

const RATING_UNIT = "rating_1_5";

function categoryLabel(category: string) {
  const known = CATEGORY_LABELS[category];
  if (known) return known;
  const words = category
    .split("_")
    .map((part) => part.trim())
    .filter(Boolean);
  if (words.length === 0) return "Other";
  return words
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function responseCountLabel(count: number) {
  return `${count} ${count === 1 ? "response" : "responses"}`;
}

function formatDecimal(value: number, maximumFractionDigits: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatMoney(value: number) {
  const whole = Number.isInteger(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number) {
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded)
    ? rounded.toFixed(0)
    : rounded.toFixed(1);
  return `${text}%`;
}

function formatOrdinaryNumber(average: number, unit: string | null) {
  if (unit === "USD") return formatMoney(average);
  if (unit === "USD_per_month") return `${formatMoney(average)} per month`;
  if (unit === "patients") return `${formatDecimal(average, 1)} patients`;
  if (!unit) return formatDecimal(average, 1);
  return `${formatDecimal(average, 1)} ${unit}`;
}

type MetricDisplay = {
  primary: string;
  detail: string;
};

function metricDisplay(metric: WorkplaceMetricAggregate): MetricDisplay | null {
  if (metric.responseCount <= 0) return null;

  if (metric.valueType === "boolean") {
    if (metric.booleanTruePercent === null) return null;
    return {
      primary: `${formatPercent(metric.booleanTruePercent)} yes`,
      detail: responseCountLabel(metric.responseCount),
    };
  }

  if (metric.valueType === "number") {
    if (metric.numericAverage === null) return null;
    if (metric.unit === RATING_UNIT) {
      return {
        primary: metric.numericAverage.toFixed(1),
        detail: `1–5 scale · ${responseCountLabel(metric.responseCount)}`,
      };
    }
    return {
      primary: formatOrdinaryNumber(metric.numericAverage, metric.unit),
      detail: responseCountLabel(metric.responseCount),
    };
  }

  return null;
}

function groupedMetrics(metrics: WorkplaceMetricAggregate[]) {
  const buckets = new Map<
    string,
    Array<{ metric: WorkplaceMetricAggregate; display: MetricDisplay }>
  >();

  for (const metric of metrics) {
    const display = metricDisplay(metric);
    if (!display) continue;
    const group = buckets.get(metric.category) ?? [];
    group.push({ metric, display });
    buckets.set(metric.category, group);
  }

  const orderedKeys = [
    ...CATEGORY_ORDER.filter((key) => buckets.has(key)),
    ...[...buckets.keys()].filter(
      (key) => !CATEGORY_ORDER.includes(key as (typeof CATEGORY_ORDER)[number]),
    ),
  ];

  return orderedKeys.map((key) => ({
    key,
    label: categoryLabel(key),
    items: buckets.get(key) ?? [],
  }));
}

export function WorkplaceSnapshot({
  aggregate,
  professionLabel,
}: {
  aggregate: WorkplaceAggregate | null;
  professionLabel: string;
}) {
  const approvedReportCount = aggregate?.approvedReportCount ?? 0;
  const groups =
    approvedReportCount > 0 && aggregate
      ? groupedMetrics(aggregate.metrics)
      : [];
  const hasReports = approvedReportCount > 0;

  return (
    <section className="space-y-4" aria-labelledby="workplace-snapshot-heading">
      <div>
        <h2
          id="workplace-snapshot-heading"
          className="font-heading text-2xl"
        >
          Workplace Snapshot
        </h2>
        <p className="text-sm text-muted-foreground">
          Worker-reported workplace data for {professionLabel}. This is not CMS
          clinical quality.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{professionLabel}</CardTitle>
          <CardDescription>
            {approvedReportCount} approved{" "}
            {approvedReportCount === 1 ? "response" : "responses"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {!hasReports ? (
            <p className="text-muted-foreground">
              No approved workplace data yet for this profession.
            </p>
          ) : groups.length === 0 ? (
            <p className="text-muted-foreground">
              Approved responses are on file, but no current metrics have
              answers yet.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Each metric is shown on its own. These figures are not combined
                into a score.
              </p>
              <div className="space-y-4">
                {groups.map((group) => (
                  <div key={group.key} className="space-y-2">
                    <h3 className="font-medium">{group.label}</h3>
                    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                      {group.items.map(({ metric, display }) => (
                        <div key={metric.slug} className="min-w-0">
                          <p className="text-muted-foreground">{metric.label}</p>
                          <p>
                            <span className="font-medium">{display.primary}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              · {display.detail}
                            </span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
