import { ProfessionSelector } from "@/components/profession-selector";
import Link from "next/link";
import { ArrowRight, Database, GitBranch, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { searchHospitals } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const hospitals = await searchHospitals(undefined, 6);

  return (
    <div>
      <section className="border-b border-border bg-[radial-gradient(1200px_circle_at_10%_-10%,oklch(0.9_0.05_185),transparent_55%)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:py-16">
          <div className="space-y-6">
            <p className="text-xs font-semibold tracking-[0.22em] text-teal-800 uppercase">
              For travel and staff nurses
            </p>
            <h1 className="font-heading text-4xl leading-tight text-balance sm:text-5xl">
              Compare hospitals on quality, workplace factors, pay, and what healthcare workers report.
            </h1>
            <p className="max-w-xl text-lg leading-8 text-muted-foreground">
              Explore hospitals using official CMS facility and quality data, with workplace
  information designed for travel and staff nurses. Pay, cost of living, staffing,
  EMR, and peer reviews are added through a validated data pipeline as those
  datasets become available.
            </p>
            <div className="max-w-sm space-y-3">
  <ProfessionSelector />

  <Link
    href="/compare?profession=registered-nurse"
    className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
  >
    Compare hospitals
  </Link>
</div>
          </div>
         <Card className="bg-card/90">
  <CardHeader>
    <CardTitle>Built around authoritative hospital data</CardTitle>
    <CardDescription>
      A nationwide hospital directory with CMS quality measures and workplace data.
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4 text-sm leading-6">
    <p>
      Hospitals are identified by CMS Certification Number (CCN). Available CMS
      quality data includes overall hospital ratings and mortality, safety,
      readmission, and patient-experience measures.
    </p>
    <p className="text-muted-foreground">
      Workplace information such as trauma level, Magnet status, teaching status,
      beds, EMR, pay, staffing, management, and work-life balance can be added as
      validated data becomes available.
    </p>
  </CardContent>
</Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 className="font-heading text-2xl">Pipeline, not a chatbot overlay</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: GitBranch,
              title: "Agents propose",
              body: "Grok (or any worker) POSTs candidate JSON to /api/ingest/candidates. Rows land in staging_candidates and status=staging facts/salaries.",
            },
            {
              icon: ShieldCheck,
              title: "Validators promote",
              body: "A human or validation worker sets status=approved. Rejected rows stay out of search, compare, and review lists.",
            },
            {
              icon: Database,
              title: "Website reads Postgres",
              body: "The App Router and API only query production tables. The UI is a reader, never an author of live hospital content.",
            },
          ].map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <item.icon className="size-5 text-teal-800" />
                <CardTitle>{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                {item.body}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <h2 className="font-heading text-2xl">Hospital directory</h2>
          <Link href="/hospitals" className="text-sm text-teal-800 hover:underline">
            Browse all
          </Link>
        </div>
        {hospitals.length === 0 ? (
          <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
           Hospital data is currently unavailable.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hospitals.map((hospital) => (
              <li key={hospital.ccn}>
                <Link href={`/hospitals/${hospital.ccn}?profession=registered-nurse`} className="block h-full">
                  <Card className="h-full hover:ring-teal-700/40">
                    <CardHeader>
                      <CardTitle>{hospital.name}</CardTitle>
                      <CardDescription>
                        {hospital.city}, {hospital.state} · {hospital.ccn}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                      {hospital.beds ?? "—"} beds · {hospital.traumaLevel ?? "Trauma n/a"} ·{" "}
                      {hospital.magnetStatus ?? "Magnet unreported"}
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
