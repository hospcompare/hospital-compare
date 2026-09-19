import { AlertTriangle } from "lucide-react";

export function PipelineBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div className="border-b border-amber-800/20 bg-amber-100 text-amber-950">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 sm:px-6">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="text-sm leading-6">
          <span className="font-semibold">Data under construction.</span>{" "}
          {compact
            ? "Hospital and CMS quality data come from validated source records. Other workplace metrics appear only after validation and approval."
            : "Hospital identity and CMS quality data are sourced from official CMS datasets. Pay, cost-of-living, and workplace review data appear only after validation and approval. Staging candidates remain hidden until approved."}
        </p>
      </div>
    </div>
  );
}
