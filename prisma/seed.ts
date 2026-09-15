import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const COL_DATASET = "SEED_COL_PLACEHOLDER_2025";
const SEED_SOURCE = "Hospital Compare seed (sample data — not a live CMS extract)";
const SEED_SOURCE_URL = "https://example.invalid/hospital-compare/seed";

async function main() {
  const existing = await prisma.hospital.findUnique({
    where: { ccn: "SAMPLE-001" },
  });
  if (existing) {
    console.log("Seed hospitals already present; skipping.");
    return;
  }

  const hospitals = [
    {
      ccn: "SAMPLE-001",
      name: "Cedar Ridge Medical Center",
      address: "1800 Peoria Street",
      city: "Aurora",
      state: "CO",
      zip: "80014",
      county: "Arapahoe",
      healthSystem: "High Plains Health (sample)",
      hospitalType: "Acute Care",
      traumaLevel: "Level II",
      beds: 412,
      teachingStatus: "Limited teaching",
      ownership: "Nonprofit",
      emr: "Epic (sample)",
      website: "https://example.invalid/cedar-ridge",
      magnetStatus: "Magnet",
    },
    {
      ccn: "SAMPLE-002",
      name: "Bayview General Hospital",
      address: "4400 University Avenue",
      city: "San Diego",
      state: "CA",
      zip: "92103",
      county: "San Diego",
      healthSystem: "Pacific Alliance Health (sample)",
      hospitalType: "Acute Care",
      traumaLevel: "Level I",
      beds: 687,
      teachingStatus: "Major teaching",
      ownership: "Nonprofit",
      emr: "Epic (sample)",
      website: "https://example.invalid/bayview",
      magnetStatus: "Magnet",
    },
    {
      ccn: "SAMPLE-003",
      name: "Prairie Health Regional",
      address: "900 Grand Avenue",
      city: "Des Moines",
      state: "IA",
      zip: "50309",
      county: "Polk",
      healthSystem: "Heartland Independent (sample)",
      hospitalType: "Acute Care",
      traumaLevel: "Level III",
      beds: 218,
      teachingStatus: "Non-teaching",
      ownership: "Nonprofit",
      emr: "Oracle Health / Cerner (sample)",
      website: "https://example.invalid/prairie",
      magnetStatus: null,
    },
    {
      ccn: "SAMPLE-004",
      name: "Palmetto Shore Hospital",
      address: "215 Bayshore Boulevard",
      city: "Tampa",
      state: "FL",
      zip: "33606",
      county: "Hillsborough",
      healthSystem: "Gulf Coast Partners (sample)",
      hospitalType: "Acute Care",
      traumaLevel: "Level II",
      beds: 340,
      teachingStatus: "Limited teaching",
      ownership: "For-profit",
      emr: "MEDITECH (sample)",
      website: "https://example.invalid/palmetto",
      magnetStatus: "Pathway to Excellence",
    },
    {
      ccn: "SAMPLE-005",
      name: "Lakeside Teaching Hospital",
      address: "701 Chicago Avenue",
      city: "Minneapolis",
      state: "MN",
      zip: "55404",
      county: "Hennepin",
      healthSystem: "North Star Academic Medicine (sample)",
      hospitalType: "Acute Care",
      traumaLevel: "Level I",
      beds: 550,
      teachingStatus: "Major teaching",
      ownership: "Government — county",
      emr: "Epic (sample)",
      website: "https://example.invalid/lakeside",
      magnetStatus: "Magnet",
    },
    {
      ccn: "SAMPLE-006",
      name: "Ironwood Community Hospital",
      address: "44 Warm Springs Road",
      city: "Boise",
      state: "ID",
      zip: "83702",
      county: "Ada",
      healthSystem: "Independent (sample)",
      hospitalType: "Community / Critical Access",
      traumaLevel: "Level IV",
      beds: 86,
      teachingStatus: "Non-teaching",
      ownership: "Nonprofit",
      emr: "MEDITECH (sample)",
      website: "https://example.invalid/ironwood",
      magnetStatus: null,
    },
  ] as const;

  for (const hospital of hospitals) {
    await prisma.hospital.create({
      data: { ...hospital, isSeed: true },
    });
  }

  const asOf = new Date("2025-07-01");
  const colRows = [
    { locationKey: "80014", indexValue: 112.4 },
    { locationKey: "92103", indexValue: 148.6 },
    { locationKey: "50309", indexValue: 91.2 },
    { locationKey: "33606", indexValue: 104.8 },
    { locationKey: "55404", indexValue: 106.3 },
    { locationKey: "83702", indexValue: 98.1 },
    { locationKey: "Denver-Aurora-Lakewood, CO", indexValue: 113.1, keyType: "metro" },
    { locationKey: "San Diego-Chula Vista-Carlsbad, CA", indexValue: 146.8, keyType: "metro" },
  ] as const;

  for (const row of colRows) {
    await prisma.colIndex.create({
      data: {
        locationKey: row.locationKey,
        keyType: "keyType" in row ? row.keyType : "zip",
        indexValue: row.indexValue,
        datasetName: COL_DATASET,
        asOfDate: asOf,
      },
    });
  }

  const factDate = new Date("2025-01-15");
  const approvedFacts = [
    ["SAMPLE-001", "beds", "412"],
    ["SAMPLE-001", "trauma_level", "Level II"],
    ["SAMPLE-001", "magnet_status", "Magnet"],
    ["SAMPLE-001", "teaching_status", "Limited teaching"],
    ["SAMPLE-001", "ownership", "Nonprofit"],
    ["SAMPLE-001", "emr", "Epic (sample)"],
    ["SAMPLE-002", "beds", "687"],
    ["SAMPLE-002", "trauma_level", "Level I"],
    ["SAMPLE-002", "magnet_status", "Magnet"],
    ["SAMPLE-002", "teaching_status", "Major teaching"],
    ["SAMPLE-003", "beds", "218"],
    ["SAMPLE-003", "trauma_level", "Level III"],
    ["SAMPLE-003", "magnet_status", ""],
    ["SAMPLE-004", "beds", "340"],
    ["SAMPLE-004", "trauma_level", "Level II"],
    ["SAMPLE-004", "magnet_status", "Pathway to Excellence"],
    ["SAMPLE-005", "beds", "550"],
    ["SAMPLE-005", "trauma_level", "Level I"],
    ["SAMPLE-005", "magnet_status", "Magnet"],
    ["SAMPLE-006", "beds", "86"],
    ["SAMPLE-006", "trauma_level", "Level IV"],
  ] as const;

  for (const [hospitalCcn, fieldName, value] of approvedFacts) {
    await prisma.hospitalFact.create({
      data: {
        hospitalCcn,
        fieldName,
        value: value || "unreported",
        source: SEED_SOURCE,
        sourceUrl: SEED_SOURCE_URL,
        effectiveDate: factDate,
        confidence: 0.7,
        status: "approved",
      },
    });
  }

  // Staging fact — must not appear in public UI until a validator approves it.
  await prisma.hospitalFact.create({
    data: {
      hospitalCcn: "SAMPLE-001",
      fieldName: "beds",
      value: "430",
      source: "Unvalidated agent candidate (sample)",
      sourceUrl: "https://example.invalid/agent-candidate",
      effectiveDate: new Date("2026-03-01"),
      confidence: 0.35,
      status: "staging",
    },
  });

  const salaries = [
    {
      hospitalCcn: "SAMPLE-001",
      role: "Travel RN",
      hourlyMin: 58,
      hourlyMax: 76,
      annual: null,
    },
    {
      hospitalCcn: "SAMPLE-001",
      role: "Staff RN",
      hourlyMin: 38,
      hourlyMax: 52,
      annual: 93600,
    },
    {
      hospitalCcn: "SAMPLE-002",
      role: "Travel RN",
      hourlyMin: 68,
      hourlyMax: 92,
      annual: null,
    },
    {
      hospitalCcn: "SAMPLE-002",
      role: "Staff RN",
      hourlyMin: 54,
      hourlyMax: 78,
      annual: 137280,
    },
    {
      hospitalCcn: "SAMPLE-003",
      role: "Travel RN",
      hourlyMin: 48,
      hourlyMax: 64,
      annual: null,
    },
    {
      hospitalCcn: "SAMPLE-003",
      role: "Staff RN",
      hourlyMin: 32,
      hourlyMax: 44,
      annual: 79040,
    },
    {
      hospitalCcn: "SAMPLE-004",
      role: "Travel RN",
      hourlyMin: 52,
      hourlyMax: 70,
      annual: null,
    },
    {
      hospitalCcn: "SAMPLE-004",
      role: "Staff RN",
      hourlyMin: 34,
      hourlyMax: 46,
      annual: 83200,
    },
    {
      hospitalCcn: "SAMPLE-005",
      role: "Travel RN",
      hourlyMin: 56,
      hourlyMax: 74,
      annual: null,
    },
    {
      hospitalCcn: "SAMPLE-005",
      role: "Staff RN",
      hourlyMin: 42,
      hourlyMax: 61,
      annual: 107120,
    },
    {
      hospitalCcn: "SAMPLE-006",
      role: "Travel RN",
      hourlyMin: 50,
      hourlyMax: 66,
      annual: null,
    },
  ] as const;

  const salaryDate = new Date("2025-10-01");
  for (const salary of salaries) {
    await prisma.salary.create({
      data: {
        ...salary,
        source: SEED_SOURCE,
        sourceUrl: SEED_SOURCE_URL,
        effectiveDate: salaryDate,
        confidence: 0.55,
        status: "approved",
      },
    });
  }

  await prisma.salary.create({
    data: {
      hospitalCcn: "SAMPLE-002",
      role: "Travel RN",
      hourlyMin: 99,
      hourlyMax: 120,
      source: "Unvalidated agent candidate (sample)",
      sourceUrl: "https://example.invalid/agent-candidate",
      effectiveDate: new Date("2026-04-01"),
      confidence: 0.2,
      status: "staging",
    },
  });

  const approvedReviews = [
    {
      hospitalCcn: "SAMPLE-001",
      body: "Travel contract on the neuro step-down. Ratios held at 4:1 on nights. Charge RN actually helped with turns. Epic is well built. Parking is a hike from the traveler lot.",
      employmentType: "travel" as const,
      unit: "Neuro step-down",
      overallScore: 4,
      staffingScore: 4,
      managementScore: 4,
      payScore: 4,
      wlbScore: 3,
      sentiment: "positive" as const,
    },
    {
      hospitalCcn: "SAMPLE-001",
      body: "Staff med-surg. Weekend staffing is thinner than weekday. Management is reachable but slow to post extra shifts. Pay is competitive for the metro if you are not coming from California.",
      employmentType: "staff" as const,
      unit: "Med-surg",
      overallScore: 3,
      staffingScore: 3,
      managementScore: 3,
      payScore: 3,
      wlbScore: 3,
      sentiment: "mixed" as const,
    },
    {
      hospitalCcn: "SAMPLE-002",
      body: "Level I nights in the ED. High acuity, excellent techs, but boarding is constant. Travel pay is strong until you divide by San Diego rent. Orientation was thorough.",
      employmentType: "travel" as const,
      unit: "Emergency",
      overallScore: 4,
      staffingScore: 3,
      managementScore: 4,
      payScore: 5,
      wlbScore: 2,
      sentiment: "mixed" as const,
    },
    {
      hospitalCcn: "SAMPLE-002",
      body: "ICU staff. Magnet culture is real on paper. Rapid response support is excellent. Parking fees and housing make the take-home feel smaller than the hourly rate suggests.",
      employmentType: "staff" as const,
      unit: "MICU",
      overallScore: 4,
      staffingScore: 4,
      managementScore: 4,
      payScore: 3,
      wlbScore: 3,
      sentiment: "positive" as const,
    },
    {
      hospitalCcn: "SAMPLE-003",
      body: "Travel med-surg. Ratios floated between 5 and 6. Night supervisor was fair. Housing stipend stretched farther here than on the coasts. Equipment is older but functional.",
      employmentType: "travel" as const,
      unit: "Med-surg",
      overallScore: 3,
      staffingScore: 2,
      managementScore: 3,
      payScore: 4,
      wlbScore: 3,
      sentiment: "mixed" as const,
    },
    {
      hospitalCcn: "SAMPLE-004",
      body: "PCU travel. Charge RNs were stretched. For-profit pressure to take extra patients showed up on weekends. Pay was fine; break coverage was not.",
      employmentType: "travel" as const,
      unit: "PCU",
      overallScore: 2,
      staffingScore: 2,
      managementScore: 2,
      payScore: 3,
      wlbScore: 2,
      sentiment: "negative" as const,
    },
    {
      hospitalCcn: "SAMPLE-005",
      body: "Academic MICU. Learners everywhere, which is a plus if you like teaching. Resource RNs exist. Night parking is easy. Winter commute is the real tax.",
      employmentType: "travel" as const,
      unit: "MICU",
      overallScore: 4,
      staffingScore: 4,
      managementScore: 3,
      payScore: 4,
      wlbScore: 3,
      sentiment: "positive" as const,
    },
    {
      hospitalCcn: "SAMPLE-006",
      body: "Small community hospital. You float a lot and know everyone. No traveler house supervisor after 1900. Great for a quiet contract if you are comfortable without a big specialty bench.",
      employmentType: "travel" as const,
      unit: "MS/telemetry float",
      overallScore: 4,
      staffingScore: 3,
      managementScore: 4,
      payScore: 4,
      wlbScore: 4,
      sentiment: "positive" as const,
    },
  ];

  for (const review of approvedReviews) {
    await prisma.review.create({
      data: {
        ...review,
        moderationStatus: "approved",
        fraudRiskScore: 0.08,
      },
    });
  }

  await prisma.review.create({
    data: {
      hospitalCcn: "SAMPLE-002",
      body: "This hospital is perfect in every way and you should sign immediately. (Pending sample — should not appear until moderation.)",
      employmentType: "unknown",
      unit: "Unknown",
      overallScore: 5,
      staffingScore: 5,
      managementScore: 5,
      payScore: 5,
      wlbScore: 5,
      sentiment: "unknown",
      moderationStatus: "pending",
      fraudRiskScore: null,
    },
  });

  const flagged = await prisma.review.create({
    data: {
      hospitalCcn: "SAMPLE-004",
      body: "Copy-paste promo language. Flagged sample and hidden from the public list.",
      employmentType: "travel",
      unit: "ICU",
      overallScore: 5,
      payScore: 5,
      sentiment: "unknown",
      moderationStatus: "flagged",
      fraudRiskScore: 0.81,
    },
  });

  await prisma.reviewFlag.create({
    data: {
      reviewId: flagged.id,
      reason: "possible_spam",
      details: "Seed flag to demonstrate review_flags. Not a live classifier output.",
    },
  });

  console.log("Seeded 6 sample hospitals (CCN SAMPLE-001 … SAMPLE-006).");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
