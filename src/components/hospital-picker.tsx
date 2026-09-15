"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { HospitalSummary } from "@/lib/contracts";

const MAX_COMPARE = 5;

export function HospitalPicker({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [hospitals, setHospitals] = useState<HospitalSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      setStatus("loading");
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("search", query.trim());
        const response = await fetch(`/api/hospitals?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("search failed");
        const data = (await response.json()) as { hospitals: HospitalSummary[] };
        setHospitals(data.hospitals);
        setStatus("ready");
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setStatus("error");
      }
    }, 180);
    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [query]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggle(ccn: string) {
    setSelected((current) => {
      if (current.includes(ccn)) return current.filter((id) => id !== ccn);
      if (current.length >= MAX_COMPARE) return current;
      return [...current, ccn];
    });
  }

  function goCompare() {
    if (selected.length < 2) return;
    router.push(`/compare?ccns=${selected.join(",")}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">Search hospitals</span>
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, city, state, ZIP, or CCN"
            className="h-10 bg-card pl-8"
          />
        </label>
        <Button
          onClick={goCompare}
          disabled={selected.length < 2}
          className="h-10 bg-teal-800 text-teal-50 hover:bg-teal-700"
        >
          Compare {selected.length || ""} selected
        </Button>
      </div>

      {selected.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {selected.length} selected (max {MAX_COMPARE}). Open a hospital for reviews, or compare
          side by side.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Select at least two hospitals to open the compare table.
        </p>
      )}

      {status === "error" ? (
        <Card>
          <CardContent className="py-8 text-sm text-destructive">
            Search failed. Confirm PostgreSQL is running and reload.
          </CardContent>
        </Card>
      ) : null}

      {status === "loading" && hospitals.length === 0 ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-xl bg-card ring-1 ring-foreground/10" />
          ))}
        </div>
      ) : null}

      {status === "ready" && hospitals.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            No production hospitals match “{query}”. Agent candidates are not searchable until a
            validator promotes them.
          </CardContent>
        </Card>
      ) : null}

      <ul className="grid gap-3">
        {hospitals.map((hospital) => {
          const checked = selectedSet.has(hospital.ccn);
          const disabled = !checked && selected.length >= MAX_COMPARE;
          return (
            <li key={hospital.ccn}>
              <Card className={checked ? "ring-2 ring-teal-700" : ""}>
                <CardContent className="flex flex-col gap-3 py-1 sm:flex-row sm:items-center">
                  <label className="flex flex-1 cursor-pointer items-start gap-3">
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={() => toggle(hospital.ccn)}
                      className="mt-1"
                      aria-label={`Select ${hospital.name}`}
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-heading text-lg leading-tight">{hospital.name}</span>
                        {hospital.isSeed ? (
                          <Badge variant="outline">Seed SAMPLE</Badge>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {hospital.city}, {hospital.state} {hospital.zip}
                        {hospital.county ? ` · ${hospital.county} County` : ""} · CCN {hospital.ccn}
                      </span>
                      <span className="mt-1 block text-sm">
                        {hospital.beds ?? "—"} beds · {hospital.traumaLevel ?? "Trauma n/a"} ·{" "}
                        {hospital.magnetStatus ?? "Magnet unreported"} ·{" "}
                        {hospital.teachingStatus ?? "Teaching unreported"}
                      </span>
                    </span>
                  </label>
                  <Link
                    href={`/hospitals/${hospital.ccn}`}
                    className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-sm hover:bg-muted"
                  >
                    Details
                  </Link>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
