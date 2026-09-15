import { AlertTriangle } from "lucide-react";

export function PipelineBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div className="border-b border-amber-800/20 bg-amber-100 text-amber-950">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 sm:px-6">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="text-sm leading-6">
          <span className="font-semibold">Data under construction.</span>{" "}
          {compact
            ? "Figures come from approved validation-pipeline rows, not live CMS scrapes. Agents never write this page."
            : "Every hospital, salary, COL index, and review on this site is served from PostgreSQL production tables after a validation step. Agent candidates land in staging and stay invisible until approved. This milestone uses labeled SAMPLE-* CCNs — not a live CMS quality scrape."}
        </p>
      </div>
    </div>
  );
}
