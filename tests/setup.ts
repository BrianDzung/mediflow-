import { execSync } from "node:child_process";

process.env.DATABASE_URL = "file:./test.db";
process.env.AUTH_SECRET = "test-secret-not-for-production-use-32ch";

execSync("npx prisma db push --skip-generate", {
  stdio: "inherit",
  env: process.env,
});
