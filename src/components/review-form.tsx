"use client";

import { useRef, useState } from "react";
import { WorkerPayFields } from "@/components/worker-pay-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewSubmit } from "@/lib/contracts";
import { employmentTypeOptions } from "@/lib/employment-type-options";
import {
  initialWorkerPayFormState,
  submitReviewWithOptionalPay,
  type ContributionSubmitStatus,
  type WorkerPayFormState,
} from "@/lib/worker-pay-form";

const scoreFields = [
  { key: "overallScore", label: "Overall" },
  { key: "staffingScore", label: "Staffing" },
  { key: "managementScore", label: "Management" },
  { key: "payScore", label: "Pay" },
  { key: "wlbScore", label: "Work-life balance" },
] as const;

type ScoreKey = (typeof scoreFields)[number]["key"];

export function ReviewForm({
  hospitalCcn,
  professionSlug,
}: {
  hospitalCcn: string;
  professionSlug: string;
}) {
  const [body, setBody] = useState("");
  const [unit, setUnit] = useState("");
  const [employmentType, setEmploymentType] =
    useState<ReviewSubmit["employmentType"]>("travel");
  const [scores, setScores] = useState<Partial<Record<ScoreKey, number>>>({});
  const [pay, setPay] = useState<WorkerPayFormState>(() =>
    initialWorkerPayFormState(professionSlug),
  );
  const [reviewCommitted, setReviewCommitted] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "saving" | ContributionSubmitStatus
  >("idle");
  const [message, setMessage] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const draftingReview = !reviewCommitted || body.trim().length > 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setStatus("saving");
    setMessage(null);
    const retryPayOnly = reviewCommitted && body.trim().length === 0;
    try {
      const result = await submitReviewWithOptionalPay({
        hospitalCcn,
        body,
        employmentType,
        unit,
        scores,
        pay,
        skipReview: retryPayOnly,
      });
      setStatus(result.status);
      setMessage(result.message);
      if (result.reviewSaved && !retryPayOnly) {
        setReviewCommitted(true);
        setBody("");
        setUnit("");
        setScores({});
      }
      if (result.paySaved) {
        setPay(initialWorkerPayFormState(professionSlug));
      }
    } finally {
      submittingRef.current = false;
    }
  }

  const messageClass =
    status === "error"
      ? "text-sm text-destructive"
      : status === "partial"
        ? "text-sm text-amber-800"
        : "text-sm text-teal-800";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="employmentType">Employment type</Label>
          <select
            id="employmentType"
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            value={employmentType}
            onChange={(event) =>
              setEmploymentType(event.target.value as ReviewSubmit["employmentType"])
            }
          >
            {employmentTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit">Unit</Label>
          <Input
            id="unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            placeholder="ICU, ED, med-surg…"
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Scores (optional, 1–5)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {scoreFields.map((field) => (
            <label key={field.key} className="flex items-center justify-between gap-3 text-sm">
              <span>{field.label}</span>
              <select
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                value={scores[field.key] ?? ""}
                onChange={(event) => {
                  const next = event.target.value;
                  setScores((current) => ({
                    ...current,
                    [field.key]: next ? Number(next) : undefined,
                  }));
                }}
              >
                <option value="">Skip</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="body">Review</Label>
        <Textarea
          id="body"
          required={draftingReview}
          minLength={draftingReview ? 20 : undefined}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What should a traveler or staff nurse know about ratios, charge support, housing, and the unit?"
        />
        <p className="text-xs text-muted-foreground">
          Original text is stored immutably. Classifier, moderation, and fraud agents are stubbed
          — this submission stays pending and off the public list.
        </p>
      </div>

      <fieldset className="space-y-3 rounded-lg border border-input p-3">
        <legend className="px-1 text-sm font-medium">
          Pay at this hospital (optional)
        </legend>
        <p className="text-xs text-muted-foreground">
          Leave hourly base pay blank to submit your review without a pay report.
        </p>
        <WorkerPayFields
          idPrefix="review-pay"
          values={pay}
          onChange={setPay}
        />
      </fieldset>

      {message ? (
        <p role="status" className={messageClass}>
          {message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={status === "saving"}
        className="bg-teal-800 text-teal-50 hover:bg-teal-700"
      >
        {status === "saving" ? "Submitting…" : "Submit for moderation"}
      </Button>
    </form>
  );
}
