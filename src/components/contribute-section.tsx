"use client";

import { useState } from "react";
import { PayReportForm } from "@/components/pay-report-form";
import { ReviewForm } from "@/components/review-form";
import { WorkplaceReportForm } from "@/components/workplace-report-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ContributePanel = "review" | "pay" | "workplace";

const entryPoints: { id: ContributePanel; label: string }[] = [
  { id: "review", label: "Write a workplace review" },
  { id: "pay", label: "Report your pay" },
  { id: "workplace", label: "Share workplace details" },
];

export function ContributeSection({
  hospitalCcn,
  professionSlug,
}: {
  hospitalCcn: string;
  professionSlug: string;
}) {
  const [active, setActive] = useState<ContributePanel | null>(null);

  return (
    <section className="space-y-4" aria-labelledby="contribute-heading">
      <div>
        <h2 id="contribute-heading" className="font-heading text-2xl">
          Contribute
        </h2>
        <p className="text-sm text-muted-foreground">
          Help other healthcare workers by sharing your experience.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {entryPoints.map((entry) => {
          const selected = active === entry.id;
          return (
            <Button
              key={entry.id}
              type="button"
              variant={selected ? "default" : "outline"}
              aria-expanded={selected}
              className={
                selected
                  ? "bg-teal-800 text-teal-50 hover:bg-teal-700"
                  : undefined
              }
              onClick={() => setActive(selected ? null : entry.id)}
            >
              {entry.label}
            </Button>
          );
        })}
      </div>

      {active === "review" ? (
        <Card>
          <CardHeader>
            <CardTitle>Write a workplace review</CardTitle>
            <CardDescription>
              Creates a pending review. Pay at this hospital is optional and is
              stored as its own report.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReviewForm
              hospitalCcn={hospitalCcn}
              professionSlug={professionSlug}
            />
          </CardContent>
        </Card>
      ) : null}

      {active === "pay" ? (
        <Card>
          <CardHeader>
            <CardTitle>Report your pay</CardTitle>
            <CardDescription>
              Share base hourly pay for this hospital.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PayReportForm
              hospitalCcn={hospitalCcn}
              professionSlug={professionSlug}
            />
          </CardContent>
        </Card>
      ) : null}

      {active === "workplace" ? (
        <Card>
          <CardHeader>
            <CardTitle>Share workplace details</CardTitle>
            <CardDescription>
              Answer only the questions you know. Submitted data remains pending
              until moderation and will not affect public hospital comparisons
              yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share structured workplace information to help healthcare workers
              compare hospitals. This initial questionnaire is designed for
              registered nurses.
            </p>
            <WorkplaceReportForm
              hospitalCcn={hospitalCcn}
              professionSlug={professionSlug}
            />
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
