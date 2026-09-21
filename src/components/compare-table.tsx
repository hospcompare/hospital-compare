import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CompareResponse } from "@/lib/contracts";
import { formatHourly, formatScore } from "@/lib/compare";

function dash(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  return String(value);
}
function formatQualityComparison(
  measureCount: number | null | undefined,
  better: number | null | undefined,
  same: number | null | undefined,
  worse: number | null | undefined,
) {
  if (measureCount == null) return "Not Available";

  return `${measureCount} measures · ${better ?? 0} better / ${same ?? 0} same / ${worse ?? 0} worse`;
}
export function CompareTable({
  result,
  professionSlug,
}: {
  result: CompareResponse;
  professionSlug: string;
}) {
  if (result.hospitals.length === 0) {
    return (
      <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
        None of those CCNs exist in the production hospital directory.
      </p>
    );
  }

  const rows: Array<{
    label: string;
    values: Array<string>;
  }> = [
    {
      label: "CCN",
      values: result.hospitals.map((row) => row.hospital.ccn),
    },
    {
      label: "Location",
      values: result.hospitals.map(
        (row) =>
          `${row.hospital.city}, ${row.hospital.state} ${row.hospital.zip}`,
      ),
    },
    {
      label: "CMS overall rating",
      values: result.hospitals.map((row) =>
        row.quality?.overallRating != null
          ? `${row.quality.overallRating} / 5`
          : "Not Available",
      ),
    },
    {
      label: "CMS mortality",
      values: result.hospitals.map((row) =>
        formatQualityComparison(
          row.quality?.mortalityMeasureCount,
          row.quality?.mortalityBetter,
          row.quality?.mortalitySame,
          row.quality?.mortalityWorse,
        ),
      ),
    },
    {
      label: "CMS safety",
      values: result.hospitals.map((row) =>
        formatQualityComparison(
          row.quality?.safetyMeasureCount,
          row.quality?.safetyBetter,
          row.quality?.safetySame,
          row.quality?.safetyWorse,
        ),
      ),
    },
    {
      label: "CMS readmissions",
      values: result.hospitals.map((row) =>
        formatQualityComparison(
          row.quality?.readmissionMeasureCount,
          row.quality?.readmissionBetter,
          row.quality?.readmissionSame,
          row.quality?.readmissionWorse,
        ),
      ),
    },
    {
      label: "Patient experience measures",
      values: result.hospitals.map((row) =>
        row.quality?.patientExperienceMeasureCount != null
          ? String(row.quality.patientExperienceMeasureCount)
          : "Not Available",
      ),
    },
    {
      label: `${result.role} pay (approved)`,
      values: result.hospitals.map((row) =>
        row.pay
          ? `${formatHourly(row.pay.hourlyMin)} – ${formatHourly(row.pay.hourlyMax)}`
          : "—",
      ),
    },
    {
      label: "Cost-of-living index",
      values: result.hospitals.map((row) =>
        row.col
          ? `${row.col.indexValue.toFixed(1)} (${row.col.datasetName})`
          : "—",
      ),
    },
    {
      label: "COL-adjusted mid pay",
      values: result.hospitals.map((row) =>
        formatHourly(row.colAdjustedHourlyMid),
      ),
    },
    {
      label: "Beds",
      values: result.hospitals.map((row) => dash(row.hospital.beds)),
    },
    {
      label: "Trauma",
      values: result.hospitals.map((row) => dash(row.hospital.traumaLevel)),
    },
    {
      label: "Magnet",
      values: result.hospitals.map((row) => dash(row.hospital.magnetStatus)),
    },
    {
      label: "Teaching",
      values: result.hospitals.map((row) => dash(row.hospital.teachingStatus)),
    },
    {
      label: "Ownership",
      values: result.hospitals.map((row) => dash(row.hospital.ownership)),
    },
    {
      label: "Review count (approved)",
      values: result.hospitals.map((row) => String(row.reviews.approvedCount)),
    },
    {
      label: "Overall / staffing / mgmt",
      values: result.hospitals.map(
        (row) =>
          `${formatScore(row.reviews.overall)} / ${formatScore(row.reviews.staffing)} / ${formatScore(row.reviews.management)}`,
      ),
    },
    {
      label: "Pay / WLB scores",
      values: result.hospitals.map(
        (row) =>
          `${formatScore(row.reviews.pay)} / ${formatScore(row.reviews.wlb)}`,
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 min-w-44 bg-card">
              Metric
            </TableHead>
            {result.hospitals.map((row) => (
              <TableHead
                key={row.hospital.ccn}
                className="min-w-48 align-bottom"
              >
                <Link
  href={`/hospitals/${row.hospital.ccn}?profession=${encodeURIComponent(
    professionSlug,
  )}`}
                  className="font-heading text-base text-foreground hover:underline"
                >
                  {row.hospital.name}
                </Link>
               
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.label}>
              <TableCell className="sticky left-0 bg-card font-medium">
                {row.label}
              </TableCell>
              {row.values.map((value, index) => (
                <TableCell
                  key={`${row.label}-${index}`}
                  className="whitespace-normal"
                >
                  {value}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {result.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}
