"use client";

import { useState } from "react";
import { WorkerPayFields } from "@/components/worker-pay-fields";
import { Button } from "@/components/ui/button";
import {
  initialWorkerPayFormState,
  submitStandalonePayForm,
  type WorkerPayFormState,
} from "@/lib/worker-pay-form";

export function PayReportForm({
  hospitalCcn,
  professionSlug,
}: {
  hospitalCcn: string;
  professionSlug: string;
}) {
  const [values, setValues] = useState<WorkerPayFormState>(() =>
    initialWorkerPayFormState(professionSlug),
  );
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setMessage(null);
    const result = await submitStandalonePayForm(hospitalCcn, values);
    if (!result.ok) {
      setStatus("error");
      setMessage(result.message);
      return;
    }
    setStatus("success");
    setMessage(result.message);
    setValues(initialWorkerPayFormState(professionSlug));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <WorkerPayFields
        idPrefix="pay-report"
        values={values}
        onChange={setValues}
        hourlyRequired
      />
      {message ? (
        <p
          role="status"
          className={
            status === "error" ? "text-sm text-destructive" : "text-sm text-teal-800"
          }
        >
          {message}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={status === "saving"}
        className="bg-teal-800 text-teal-50 hover:bg-teal-700"
      >
        {status === "saving" ? "Submitting…" : "Submit pay report"}
      </Button>
    </form>
  );
}
