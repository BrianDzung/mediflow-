import { PrismaClient } from "@prisma/client";
import { seedDatabase } from "./seed-data";

const prisma = new PrismaClient();

async function main() {
  await seedDatabase(prisma);
  console.log("Seed complete.");
  console.log("Demo accounts (password: demo1234):");
  console.log("  patient@mediflow.demo       (patient)");
  console.log("  patient2@mediflow.demo      (patient)");
  console.log("  receptionist@mediflow.demo  (receptionist)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
