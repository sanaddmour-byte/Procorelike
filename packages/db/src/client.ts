import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export function createDbClient(connectionString: string): {
  db: Database;
  queryClient: ReturnType<typeof postgres>;
} {
  const queryClient = postgres(connectionString);
  const db = drizzle(queryClient, { schema });
  return { db, queryClient };
}
