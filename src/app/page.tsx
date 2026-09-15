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
              Compare hospitals on pay, proxies for the floor, and what peers actually wrote.
            </h1>
            <p className="max-w-xl text-lg leading-8 text-muted-foreground">
              Hospital Compare is a workplace directory keyed by CMS CCN. Cost of living, approved
              salary bands, Magnet/trauma/teaching flags, and moderated reviews sit behind a
              staging pipeline. Agents propose candidates. Validators promote rows. This website
              never lets a model write the live table.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/hospitals"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-teal-800 px-4 text-sm font-medium text-teal-50 hover:bg-teal-700"
              >
                Search hospitals
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/compare?ccns=SAMPLE-001,SAMPLE-002,SAMPLE-003"
                className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium hover:bg-muted"
              >
                Open a sample compare
              </Link>
            </div>
          </div>
          <Card className="bg-card/90">
            <CardHeader>
              <CardTitle>What this milestone is</CardTitle>
              <CardDescription>
                Schema, APIs, and a thin UI over seed data. Not a live CMS scrape.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6">
              <p>
                Seed hospitals use placeholder CCNs <code>SAMPLE-001</code> through{" "}
                <code>SAMPLE-006</code>. Pay and COL figures are labeled sample datasets. No CMS
                star ratings or invented quality scores appear here.
              </p>
              <p className="text-muted-foreground">
                Work-environment proxies in v1: trauma level, Magnet status, teaching status,
                ownership, beds, EMR, and peer scores for staffing, management, pay, and WLB.
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
          <h2 className="font-heading text-2xl">Seed directory</h2>
          <Link href="/hospitals" className="text-sm text-teal-800 hover:underline">
            Browse all
          </Link>
        </div>
        {hospitals.length === 0 ? (
          <p className="rounded-xl bg-card p-6 text-sm text-muted-foreground ring-1 ring-foreground/10">
            No hospitals in production yet. Run migrations and seed (see README).
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {hospitals.map((hospital) => (
              <li key={hospital.ccn}>
                <Link href={`/hospitals/${hospital.ccn}`} className="block h-full">
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
