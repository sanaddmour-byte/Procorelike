import { sql } from "drizzle-orm";
import type { Tx } from "./client";

/**
 * Claims the next value for a project-scoped sequence via the
 * `next_sequence_number` Postgres function (packages/db/src/sql/001_rls_and_functions.sql),
 * which row-locks the sequence and serializes concurrent callers. Must be
 * called inside the same transaction as the insert it numbers, using the
 * same `tx` (see @siteops/db withRequestContext).
 */
export async function nextSequenceNumber(
  tx: Tx,
  projectId: string,
  sequenceKey: string,
): Promise<number> {
  const rows = await tx.execute<{ next_sequence_number: number }>(
    sql`SELECT next_sequence_number(${projectId}::uuid, ${sequenceKey}::varchar) AS next_sequence_number`,
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`next_sequence_number returned no rows for ${sequenceKey}/${projectId}`);
  }
  return row.next_sequence_number;
}
