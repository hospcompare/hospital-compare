import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const professions = [
  { slug: "registered-nurse", name: "Registered Nurse", abbreviation: "RN", sortOrder: 10 },
  { slug: "licensed-practical-nurse", name: "Licensed Practical Nurse", abbreviation: "LPN/LVN", sortOrder: 20 },
  { slug: "certified-nursing-assistant", name: "Certified Nursing Assistant", abbreviation: "CNA", sortOrder: 30 },
  { slug: "physician", name: "Physician", abbreviation: "MD/DO", sortOrder: 40 },
  { slug: "advanced-practice-provider", name: "Advanced Practice Provider", abbreviation: "APP", sortOrder: 50 },
  { slug: "respiratory-therapist", name: "Respiratory Therapist", abbreviation: "RT", sortOrder: 60 },
  { slug: "pharmacist", name: "Pharmacist", abbreviation: "PharmD", sortOrder: 70 },
  { slug: "radiologic-technologist", name: "Radiologic Technologist", abbreviation: "RT(R)", sortOrder: 80 },
  { slug: "medical-laboratory-professional", name: "Medical Laboratory Professional", abbreviation: null, sortOrder: 90 },
  { slug: "physical-therapist", name: "Physical Therapist", abbreviation: "PT", sortOrder: 100 },
  { slug: "occupational-therapist", name: "Occupational Therapist", abbreviation: "OT", sortOrder: 110 },
  { slug: "speech-language-pathologist", name: "Speech-Language Pathologist", abbreviation: "SLP", sortOrder: 120 },
  { slug: "surgical-technologist", name: "Surgical Technologist", abbreviation: "CST", sortOrder: 130 },
] as const;

const rnSpecialties = [
  { slug: "emergency-department", name: "Emergency Department", abbreviation: "ED", sortOrder: 10 },
  { slug: "intensive-care", name: "Intensive Care", abbreviation: "ICU", sortOrder: 20 },
  { slug: "medical-surgical", name: "Medical-Surgical", abbreviation: "Med-Surg", sortOrder: 30 },
  { slug: "telemetry", name: "Telemetry", abbreviation: "Tele", sortOrder: 40 },
  { slug: "progressive-care", name: "Progressive Care", abbreviation: "PCU", sortOrder: 50 },
  { slug: "operating-room", name: "Operating Room", abbreviation: "OR", sortOrder: 60 },
  { slug: "post-anesthesia-care", name: "Post-Anesthesia Care Unit", abbreviation: "PACU", sortOrder: 70 },
  { slug: "labor-delivery", name: "Labor & Delivery", abbreviation: "L&D", sortOrder: 80 },
  { slug: "mother-baby", name: "Mother-Baby/Postpartum", abbreviation: null, sortOrder: 90 },
  { slug: "neonatal-intensive-care", name: "Neonatal Intensive Care", abbreviation: "NICU", sortOrder: 100 },
  { slug: "pediatrics", name: "Pediatrics", abbreviation: "Peds", sortOrder: 110 },
  { slug: "pediatric-intensive-care", name: "Pediatric Intensive Care", abbreviation: "PICU", sortOrder: 120 },
  { slug: "oncology", name: "Oncology", abbreviation: null, sortOrder: 130 },
  { slug: "step-down", name: "Step-Down", abbreviation: null, sortOrder: 140 },
  { slug: "float-pool", name: "Float Pool", abbreviation: null, sortOrder: 150 },
  { slug: "behavioral-health", name: "Behavioral Health", abbreviation: null, sortOrder: 160 },
] as const;

async function main() {
  console.log("Initializing workplace catalog...");

  for (const profession of professions) {
    await prisma.profession.upsert({
      where: { slug: profession.slug },
      update: {
        name: profession.name,
        abbreviation: profession.abbreviation,
        sortOrder: profession.sortOrder,
        active: true,
      },
      create: {
        ...profession,
        active: true,
      },
    });
  }

  const rn = await prisma.profession.findUniqueOrThrow({
    where: { slug: "registered-nurse" },
  });

  for (const specialty of rnSpecialties) {
    await prisma.specialty.upsert({
      where: {
        professionId_slug: {
          professionId: rn.id,
          slug: specialty.slug,
        },
      },
      update: {
        name: specialty.name,
        abbreviation: specialty.abbreviation,
        sortOrder: specialty.sortOrder,
        active: true,
      },
      create: {
        professionId: rn.id,
        ...specialty,
        active: true,
      },
    });
  }

  const professionCount = await prisma.profession.count();
  const specialtyCount = await prisma.specialty.count();

  console.log(`Professions: ${professionCount}`);
  console.log(`Specialties: ${specialtyCount}`);
  console.log("Workplace catalog initialization complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });