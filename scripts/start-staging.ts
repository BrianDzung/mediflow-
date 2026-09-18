import { execSync, spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { seedDatabase } from "../src/lib/seed-data";

async function prepareDatabase() {
  execSync("npx prisma db push", { stdio: "inherit", env: process.env });

  const seedMode = (process.env.SEED_ON_START ?? "if-empty").trim();
  const prisma = new PrismaClient();
  try {
    const clinicCount = await prisma.clinic.count();
    const shouldSeed = seedMode === "always" || (seedMode !== "never" && clinicCount === 0);
    if (shouldSeed) {
      await seedDatabase(prisma);
      console.log(`[staging] Seeded demo data (mode=${seedMode}, had ${clinicCount} clinic(s)).`);
    } else {
      console.log(`[staging] Skipping seed (mode=${seedMode}, ${clinicCount} clinic(s)).`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function startServer() {
  const port = process.env.PORT ?? "3000";
  const hostname = process.env.HOSTNAME ?? "0.0.0.0";
  console.log(`[staging] Starting Next.js on ${hostname}:${port}`);

  const child = spawn(
    process.execPath,
    ["./node_modules/next/dist/bin/next", "start", "--hostname", hostname, "--port", port],
    { stdio: "inherit", env: process.env },
  );

  function shutdown(signal: NodeJS.Signals) {
    child.kill(signal);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  child.on("exit", (code) => process.exit(code ?? 0));
}

prepareDatabase()
  .then(startServer)
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
