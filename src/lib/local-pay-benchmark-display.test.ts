import assert from "node:assert/strict";
import test from "node:test";
import type { LocalPayBenchmarkLookup } from "./contracts";
import {
  compactBenchmarkRelease,
  formatLocalBenchmarkFigure,
  presentLocalPayBenchmark,
} from "./local-pay-benchmark-display";

const wages = {
  hourlyMean: 60,
  hourlyMedian: 57.1,
  annualMean: 120000,
  annualMedian: 118000,
  source: "BLS OEWS",
  sourceDataset: "OEWS-2025-MAY",
  sourceUrl: "https://www.bls.gov/oes/",
  effectiveDate: "2025-05-01",
};

function lookup(
  patch: Partial<LocalPayBenchmarkLookup> = {},
): LocalPayBenchmarkLookup {
  return {
    hospitalCcn: "500039",
    profession: {
      id: "prof",
      slug: "registered-nurse",
      name: "Registered Nurse",
      abbreviation: "RN",
    },
    geography: {
      countyFips: "53035",
      countyName: "Kitsap County",
      geographicAreaCode: "14740",
      geographicAreaName: "Bremerton-Silverdale-Port Orchard, WA",
      geographicLevel: "Metropolitan Statistical Area",
    },
    benchmark: wages,
    ...patch,
  };
}

test("hourly median is the primary figure", () => {
  assert.equal(formatLocalBenchmarkFigure(wages), "$57.10/hr median");
});

test("hourly mean is labeled when the hourly median is missing", () => {
  assert.equal(
    formatLocalBenchmarkFigure({
      ...wages,
      hourlyMedian: null,
    }),
    "$60.00/hr mean",
  );
});

test("annual median is used only when both hourly values are missing", () => {
  assert.equal(
    formatLocalBenchmarkFigure({
      ...wages,
      hourlyMedian: null,
      hourlyMean: null,
    }),
    "$118,000 annual median",
  );
});

test("annual mean is labeled when it is the only wage", () => {
  assert.equal(
    formatLocalBenchmarkFigure({
      ...wages,
      hourlyMedian: null,
      hourlyMean: null,
      annualMedian: null,
    }),
    "$120,000 annual mean",
  );
});

test("a wage row with no amounts has no figure", () => {
  assert.equal(
    formatLocalBenchmarkFigure({
      ...wages,
      hourlyMedian: null,
      hourlyMean: null,
      annualMedian: null,
      annualMean: null,
    }),
    null,
  );
});

test("OEWS May 2025 release stays compact when the effective date is that month", () => {
  assert.equal(
    compactBenchmarkRelease("OEWS-2025-MAY", "2025-05-01"),
    "May 2025",
  );
});

test("a different effective date is shown beside the release", () => {
  assert.equal(
    compactBenchmarkRelease("OEWS-2025-MAY", "2024-11-15"),
    "May 2025 · Nov 15, 2024",
  );
});

test("mapped hospital with a benchmark shows the market figure once", () => {
  const view = presentLocalPayBenchmark(lookup(), "Registered Nurse");
  assert.equal(view.heading, "Local RN benchmark");
  assert.match(view.context, /Registered Nurse/);
  assert.match(view.context, /Not this hospital's pay/);
  assert.match(view.context, /not specialty-specific/);
  assert.equal(view.figure, "$57.10/hr median");
  assert.equal(view.unavailable, null);
  assert.equal(view.marketName, "Bremerton-Silverdale-Port Orchard, WA");
  assert.equal(view.source, "BLS OEWS");
  assert.equal(view.sourceUrl, "https://www.bls.gov/oes/");
  assert.equal(view.release, "May 2025");
});

test("geography without wages names the market and does not invent a figure", () => {
  const view = presentLocalPayBenchmark(
    lookup({ benchmark: null }),
    "Registered Nurse",
  );
  assert.equal(view.figure, null);
  assert.equal(
    view.unavailable,
    "Local pay benchmark unavailable for this market.",
  );
  assert.equal(view.marketName, "Bremerton-Silverdale-Port Orchard, WA");
  assert.equal(view.source, null);
  assert.equal(view.release, null);
});

test("unresolved geography says the hospital benchmark is unavailable", () => {
  const view = presentLocalPayBenchmark(
    lookup({ geography: null, benchmark: null }),
    "Registered Nurse",
  );
  assert.equal(view.figure, null);
  assert.equal(
    view.unavailable,
    "Local pay benchmark unavailable for this hospital.",
  );
  assert.equal(view.marketName, null);
});

test("a missing lookup is treated as unresolved geography", () => {
  const view = presentLocalPayBenchmark(null, "Registered Nurse");
  assert.equal(view.heading, "Local Registered Nurse benchmark");
  assert.equal(
    view.unavailable,
    "Local pay benchmark unavailable for this hospital.",
  );
});
