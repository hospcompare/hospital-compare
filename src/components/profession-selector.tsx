"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_PROFESSION_SLUG,
  enabledProfessionOptions,
  isEnabledProfession,
  PROFESSION_STORAGE_KEY,
} from "@/lib/profession-options";

export function ProfessionSelector({
  initialProfession,
  destination = "/hospitals",
}: {
  initialProfession?: string | null;
  destination?: string;
}) {
  const router = useRouter();

  const [professionSlug, setProfessionSlug] = useState(
    isEnabledProfession(initialProfession)
      ? initialProfession!
      : DEFAULT_PROFESSION_SLUG,
  );

  useEffect(() => {
    if (isEnabledProfession(initialProfession)) {
      localStorage.setItem(
        PROFESSION_STORAGE_KEY,
        initialProfession!,
      );
      return;
    }

    const remembered = localStorage.getItem(PROFESSION_STORAGE_KEY);

    if (isEnabledProfession(remembered)) {
      setProfessionSlug(remembered!);
    }
  }, [initialProfession]);

  function continueToHospitals() {
    localStorage.setItem(
      PROFESSION_STORAGE_KEY,
      professionSlug,
    );

    const params = new URLSearchParams();
    params.set("profession", professionSlug);

    router.push(`${destination}?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="profession">Your profession</Label>

        <select
          id="profession"
          className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
          value={professionSlug}
          onChange={(event) =>
            setProfessionSlug(event.target.value)
          }
        >
          {enabledProfessionOptions.map((profession) => (
            <option
              key={profession.slug}
              value={profession.slug}
            >
              {profession.label}
            </option>
          ))}
        </select>
      </div>

      <Button
        type="button"
        onClick={continueToHospitals}
        className="bg-teal-800 text-teal-50 hover:bg-teal-700"
      >
        Search hospitals
      </Button>
    </div>
  );
}