import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReviewForm } from "@/components/review-form";
import { getHospitalDetail, listApprovedReviews } from "@/lib/queries";
import { formatHourly, formatScore } from "@/lib/compare";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ccn: string }>;
}) {
  const { ccn } = await params;
  const hospital = await getHospitalDetail(decodeURIComponent(ccn));
  return {
    title: hospital ? hospital.name : "Hospital",
  };
}

export default async function HospitalDetailPage({
  params,
}: {
  params: Promise<{ ccn: string }>;
}) {
  const { ccn } = await params;
  const decoded = decodeURIComponent(ccn);
  const hospital = await getHospitalDetail(decoded);
  if (!hospital) notFound();
  const reviews = await listApprovedReviews(decoded);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">CCN {hospital.ccn}</Badge>
          {hospital.magnetStatus ? (
            <Badge>{hospital.magnetStatus}</Badge>
          ) : null}
        </div>
        <h1 className="font-heading text-3xl sm:text-4xl">{hospital.name}</h1>
        <p className="text-muted-foreground">
          {hospital.address}, {hospital.city}, {hospital.state} {hospital.zip}
          {hospital.county ? ` · ${hospital.county} County` : ""}
        </p>
        <p>
          <Link
            href={`/compare?ccns=${hospital.ccn}`}
            className="text-sm text-teal-800 hover:underline"
          >
            Add to comparison
          </Link>
        </p>
      </div>
      {hospital.quality ? (
        <section className="space-y-4">
          <div>
            <h2 className="font-heading text-2xl">CMS quality</h2>
            <p className="text-sm text-muted-foreground">
              Hospital quality measures from {hospital.quality.sourceDataset},
              released {hospital.quality.releaseDate}.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle>Overall rating</CardTitle>
                <CardDescription>
                  CMS hospital overall star rating
                </CardDescription>
              </CardHeader>
              <CardContent>
                {hospital.quality.overallRating !== null ? (
                  <div className="space-y-2">
                    <p className="text-3xl font-semibold">
                      {hospital.quality.overallRating} / 5
                    </p>
                    <p
                      className="text-lg"
                      aria-label={`${hospital.quality.overallRating} out of 5 stars`}
                    >
                      {"★".repeat(hospital.quality.overallRating)}
                      {"☆".repeat(5 - hospital.quality.overallRating)}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="font-medium">Not Available</p>
                    {hospital.quality.overallRatingFootnote ? (
                      <p className="text-xs text-muted-foreground">
                        CMS footnote {hospital.quality.overallRatingFootnote}
                      </p>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>

            <QualityCard
              title="Mortality"
              measureCount={hospital.quality.mortalityMeasureCount}
              better={hospital.quality.mortalityBetter}
              same={hospital.quality.mortalitySame}
              worse={hospital.quality.mortalityWorse}
            />

            <QualityCard
              title="Safety"
              measureCount={hospital.quality.safetyMeasureCount}
              better={hospital.quality.safetyBetter}
              same={hospital.quality.safetySame}
              worse={hospital.quality.safetyWorse}
            />

            <QualityCard
              title="Readmissions"
              measureCount={hospital.quality.readmissionMeasureCount}
              better={hospital.quality.readmissionBetter}
              same={hospital.quality.readmissionSame}
              worse={hospital.quality.readmissionWorse}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Patient experience measures reported:{" "}
            {hospital.quality.patientExperienceMeasureCount ?? "Not Available"}.
            Comparisons indicate how CMS measures compare with the national
            value; they are not additional star ratings.
          </p>
        </section>
      ) : (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>CMS quality</CardTitle>
              <CardDescription>
                CMS quality data is not available for this hospital.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Workplace proxies</CardTitle>
            <CardDescription>
              Hospital characteristics and workplace information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Type" value={hospital.hospitalType} />
            <Row label="Trauma" value={hospital.traumaLevel} />
            <Row label="Beds" value={hospital.beds?.toString() ?? null} />
            <Row label="Teaching" value={hospital.teachingStatus} />
            <Row label="Ownership" value={hospital.ownership} />
            <Row label="Health system" value={hospital.healthSystem} />
            <Row label="EMR" value={hospital.emr} />
            <Row label="Magnet" value={hospital.magnetStatus} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Approved pay</CardTitle>
            <CardDescription>
              Staging salary candidates are omitted
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {hospital.salaries.length === 0 ? (
              <p className="text-muted-foreground">
                No approved salary rows yet.
              </p>
            ) : (
              hospital.salaries.map((salary) => (
                <div key={`${salary.role}-${salary.effectiveDate}`}>
                  <p className="font-medium">{salary.role}</p>
                  <p>
                    {formatHourly(salary.hourlyMin)} –{" "}
                    {formatHourly(salary.hourlyMax)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {salary.source} · confidence {salary.confidence ?? "n/a"}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>COL + reviews</CardTitle>
            <CardDescription>
              Cost-of-living data appears when an approved index is available
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="COL index"
              value={
                hospital.col
                  ? `${hospital.col.indexValue.toFixed(1)} (${hospital.col.datasetName})`
                  : null
              }
            />
            <Row
              label="Approved reviews"
              value={String(hospital.reviews.approvedCount)}
            />
            <Row
              label="Overall"
              value={formatScore(hospital.reviews.overall)}
            />
            <Row
              label="Staffing"
              value={formatScore(hospital.reviews.staffing)}
            />
            <Row
              label="Management"
              value={formatScore(hospital.reviews.management)}
            />
            <Row label="Pay score" value={formatScore(hospital.reviews.pay)} />
            <Row label="WLB" value={formatScore(hospital.reviews.wlb)} />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <h2 className="font-heading text-2xl">Approved reviews</h2>
          {reviews.length === 0 ? (
            <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
              No approved reviews yet. Pending submissions stay hidden until
              moderation.
            </p>
          ) : (
            <ul className="space-y-3">
              {reviews.map((review) => (
                <li key={review.id}>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">
                        {review.employmentType.replace("_", " ")}
                        {review.unit ? ` · ${review.unit}` : ""}
                      </CardTitle>
                      <CardDescription>
                        Overall {review.overallScore ?? "—"} · Staffing{" "}
                        {review.staffingScore ?? "—"} · Pay{" "}
                        {review.payScore ?? "—"} ·{" "}
                        {review.createdAt.slice(0, 10)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm leading-6">
                      {review.body}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Submit a review</CardTitle>
            <CardDescription>
              Creates a pending row. Review Classifier / Moderation / Fraud
              agents are stubbed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReviewForm hospitalCcn={hospital.ccn} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-2xl">Approved sourced facts</h2>
        <p className="text-sm text-muted-foreground">
          Provenance for production fields. Staging facts never appear on this
          list.
        </p>
        <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-3">Field</th>
                <th className="p-3">Value</th>
                <th className="p-3">Source</th>
                <th className="p-3">As of</th>
                <th className="p-3">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {hospital.facts.map((fact) => (
                <tr
                  key={`${fact.fieldName}-${fact.effectiveDate}-${fact.value}`}
                  className="border-b"
                >
                  <td className="p-3 font-medium">{fact.fieldName}</td>
                  <td className="p-3">{fact.value}</td>
                  <td className="p-3">{fact.source}</td>
                  <td className="p-3">{fact.effectiveDate ?? "—"}</td>
                  <td className="p-3">{fact.confidence ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function QualityCard({
  title,
  measureCount,
  better,
  same,
  worse,
}: {
  title: string;
  measureCount: number | null;
  better: number | null;
  same: number | null;
  worse: number | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {measureCount !== null
            ? `${measureCount} CMS measures`
            : "CMS measures not available"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {measureCount !== null ? (
          <>
            <Row
              label="Better than national"
              value={better?.toString() ?? null}
            />
            <Row label="Same as national" value={same?.toString() ?? null} />
            <Row
              label="Worse than national"
              value={worse?.toString() ?? null}
            />
          </>
        ) : (
          <p className="text-muted-foreground">Not Available</p>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value && value !== "—" ? value : "—"}</span>
    </div>
  );
}
