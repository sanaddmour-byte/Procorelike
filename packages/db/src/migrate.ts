import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDbClient } from "./client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const { db, queryClient } = createDbClient(connectionString);

  console.warn("Running schema migrations...");
  await migrate(db, { migrationsFolder: path.join(__dirname, "migrations") });

  console.warn("Applying RLS policies and DB functions...");
  const sqlDir = path.join(__dirname, "sql");
  const sqlFiles = readdirSync(sqlDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of sqlFiles) {
    const contents = readFileSync(path.join(sqlDir, file), "utf-8");
    await queryClient.unsafe(contents);
    console.warn(`Applied ${file}`);
  }

  await queryClient.end();
  console.warn("Migration complete.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
