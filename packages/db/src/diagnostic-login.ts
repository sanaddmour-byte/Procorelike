import { verifyPassword } from "@siteops/shared/server";
import { createDbClient } from "./client";
import { users } from "./schema";
import { eq, sql } from "drizzle-orm";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const { db, queryClient } = createDbClient(connectionString);

  const email = "sara.haddad@siteops.test";
  const attemptPassword = "ChangeMe123!";

  console.warn(`Looking up user: ${email}`);
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (rows.length === 0) {
    console.warn("RESULT: no row found for this email in the users table.");
  } else {
    const row = rows[0]!;
    console.warn(`RESULT: found user id=${row.id} name=${row.name} email=${row.email}`);
    console.warn(`Password hash prefix: ${row.passwordHash.slice(0, 20)}...`);
    const ok = await verifyPassword(row.passwordHash, attemptPassword);
    console.warn(`Password "${attemptPassword}" verifies against stored hash: ${ok}`);
  }

  const countRows = await db.select({ count: sql<number>`count(*)` }).from(users);
  console.warn(`Total rows in users table: ${countRows[0]?.count}`);

  await queryClient.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
