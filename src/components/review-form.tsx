"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewSubmit } from "@/lib/contracts";

const employmentOptions = [
  { value: "travel", label: "Travel" },
  { value: "staff", label: "Staff" },
  { value: "per_diem", label: "Per diem" },
  { value: "contract", label: "Local contract" },
  { value: "unknown", label: "Prefer not to say" },
] as const;

const scoreFields = [
  { key: "overallScore", label: "Overall" },
  { key: "staffingScore", label: "Staffing" },
  { key: "managementScore", label: "Management" },
  { key: "payScore", label: "Pay" },
  { key: "wlbScore", label: "Work-life balance" },
] as const;

type ScoreKey = (typeof scoreFields)[number]["key"];

export function ReviewForm({ hospitalCcn }: { hospitalCcn: string }) {
  const [body, setBody] = useState("");
  const [unit, setUnit] = useState("");
  const [employmentType, setEmploymentType] =
    useState<ReviewSubmit["employmentType"]>("travel");
  const [scores, setScores] = useState<Partial<Record<ScoreKey, number>>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setMessage(null);
    try {
      const payload: ReviewSubmit = {
        hospitalCcn,
        body,
        employmentType,
        unit: unit || null,
        overallScore: scores.overallScore ?? null,
        staffingScore: scores.staffingScore ?? null,
        managementScore: scores.managementScore ?? null,
        payScore: scores.payScore ?? null,
        wlbScore: scores.wlbScore ?? null,
      };
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Submit failed");
      }
      setStatus("done");
      setMessage(data.message ?? "Stored as pending.");
      setBody("");
      setUnit("");
      setScores({});
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Submit failed");
    }
  }

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
            {employmentOptions.map((option) => (
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
          required
          minLength={20}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What should a traveler or staff nurse know about ratios, charge support, housing, and the unit?"
        />
        <p className="text-xs text-muted-foreground">
          Original text is stored immutably. Classifier, moderation, and fraud agents are stubbed
          — this submission stays pending and off the public list.
        </p>
      </div>

      {message ? (
        <p className={status === "error" ? "text-sm text-destructive" : "text-sm text-teal-800"}>
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
