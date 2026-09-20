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

const metrics = [
  // Workload & Staffing
  {
    slug: "typical-patient-assignment",
    label: "Typical patient assignment",
    description:
      "Typical number of patients assigned to the worker during a shift.",
    category: "workload_staffing",
    valueType: "number" as const,
    unit: "patients",
    sortOrder: 10,
  },
  {
    slug: "highest-typical-patient-assignment",
    label: "Highest patient assignment typically encountered",
    description:
      "Highest patient assignment the worker typically encounters during normal working conditions.",
    category: "workload_staffing",
    valueType: "number" as const,
    unit: "patients",
    sortOrder: 20,
  },
  {
    slug: "charge-nurse-takes-patient-assignment",
    label: "Charge nurse usually takes a patient assignment",
    description:
      "Whether the charge nurse usually carries their own patient assignment.",
    category: "workload_staffing",
    valueType: "boolean" as const,
    unit: null,
    sortOrder: 30,
  },
  {
    slug: "dedicated-break-coverage-available",
    label: "Dedicated break or relief coverage usually available",
    description:
      "Whether dedicated break or relief coverage is usually available.",
    category: "workload_staffing",
    valueType: "boolean" as const,
    unit: null,
    sortOrder: 40,
  },
  {
    slug: "adequate-cna-tech-support",
    label: "Adequate CNA or tech support usually available",
    description:
      "Whether adequate CNA, technician, or similar support staff are usually available when applicable.",
    category: "workload_staffing",
    valueType: "boolean" as const,
    unit: null,
    sortOrder: 50,
  },

  // Schedule & Flexibility
  {
    slug: "management-scheduling-accommodation",
    label: "How accommodating is management with your scheduling needs?",
    description:
      "Employee-reported rating of how willing management is to work with scheduling needs and preferences.",
    category: "schedule_flexibility",
    valueType: "number" as const,
    unit: "rating_1_5",
    sortOrder: 10,
  },

  // Benefits
  {
    slug: "overall-benefits-satisfaction",
    label: "How satisfied are you with your overall benefits package?",
    description:
      "Employee-reported overall satisfaction with benefits provided by the employer.",
    category: "benefits",
    valueType: "number" as const,
    unit: "rating_1_5",
    sortOrder: 10,
  },
  {
    slug: "retirement-employer-contribution",
    label:
      "Does the employer offer a retirement match or employer retirement contribution?",
    description:
      "Whether the employer provides a retirement-plan match or other employer-funded retirement contribution.",
    category: "benefits",
    valueType: "boolean" as const,
    unit: null,
    sortOrder: 20,
  },
  {
    slug: "tuition-continuing-education-assistance",
    label:
      "Does the employer offer tuition or continuing-education assistance?",
    description:
      "Whether the employer provides tuition reimbursement, continuing-education assistance, or a similar educational benefit.",
    category: "benefits",
    valueType: "boolean" as const,
    unit: null,
    sortOrder: 30,
  },

  // Practical Workplace
  {
    slug: "staff-welcoming-new-hires-travelers",
    label: "How welcoming are staff toward new hires and travelers?",
    description:
      "Employee-reported rating of how welcoming existing staff are toward newly hired employees and travelers.",
    category: "practical_workplace",
    valueType: "number" as const,
    unit: "rating_1_5",
    sortOrder: 10,
  },
  {
    slug: "employee-parking-monthly-cost",
    label: "What is your typical employee parking cost per month?",
    description:
      "Approximate monthly employee parking cost. Enter 0 when employee parking is free.",
    category: "practical_workplace",
    valueType: "number" as const,
    unit: "USD_per_month",
    sortOrder: 20,
  },
  {
    slug: "workplace-security-safety",
    label: "How safe and secure do you feel at the workplace?",
    description:
      "Employee-reported rating of workplace safety and security.",
    category: "practical_workplace",
    valueType: "number" as const,
    unit: "rating_1_5",
    sortOrder: 30,
  },
  {
    slug: "cafeteria-average-meal-cost",
    label: "What is the average cost of a cafeteria meal?",
    description:
      "Approximate amount the employee typically pays for a cafeteria meal.",
    category: "practical_workplace",
    valueType: "number" as const,
    unit: "USD",
    sortOrder: 40,
  },
  {
    slug: "management-support-availability",
    label: "How available and supportive is management when issues arise?",
    description:
      "Employee-reported rating of management availability and support when workplace issues arise.",
    category: "practical_workplace",
    valueType: "number" as const,
    unit: "rating_1_5",
    sortOrder: 50,
  },
] as const;

async function main() {
  console.log("Initializing workplace metrics...");
  console.log(`Metrics: ${metrics.length}`);

  for (const metric of metrics) {
    await prisma.workplaceMetric.upsert({
      where: {
        slug: metric.slug,
      },
      update: {
        label: metric.label,
        description: metric.description,
        category: metric.category,
        valueType: metric.valueType,
        unit: metric.unit,
        active: true,
        sortOrder: metric.sortOrder,
      },
      create: {
        slug: metric.slug,
        label: metric.label,
        description: metric.description,
        category: metric.category,
        valueType: metric.valueType,
        unit: metric.unit,
        active: true,
        sortOrder: metric.sortOrder,
      },
    });
  }

  console.log("Workplace metric initialization complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });