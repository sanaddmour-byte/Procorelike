import type postgres from "postgres";
import { createDbClient } from "./client";

/**
 * Phase 8 performance pass: spreads ~160k rows across 50 synthetic
 * projects (the realistic multi-tenant shape — many projects with a
 * moderate row count each, not one project holding everything, which
 * would make every project_id filter ~100% selective and hide the point
 * of the index), then runs EXPLAIN ANALYZE for the actual hot-path
 * queries (project-scoped list queries + the cross-project daily digest
 * sweep) with and without the Phase 8 indexes.
 *
 * Everything runs inside one transaction that is ROLLED BACK at the end —
 * this is a read-only diagnostic against throwaway data, never a seed
 * meant to persist. Safe to run repeatedly against the dev DB.
 */

const NUM_PROJECTS = 50;
const PUNCH_PER_PROJECT = 2000; // 100,000 total
const RFI_PER_PROJECT = 400; // 20,000 total
const DOC_PER_PROJECT = 400; // 20,000 total
const PHOTO_PER_PROJECT = 400; // 20,000 total

interface PlanRow {
  "QUERY PLAN": string;
}

async function explain(sql: postgres.TransactionSql, label: string, query: string): Promise<void> {
  const rows = (await sql.unsafe(`EXPLAIN (ANALYZE, BUFFERS) ${query}`)) as unknown as PlanRow[];
  console.warn(`\n--- ${label} ---`);
  console.warn(query);
  for (const row of rows) console.warn(row["QUERY PLAN"]);
}

async function runQueries(sql: postgres.TransactionSql, phase: string, targetProjectId: string): Promise<void> {
  await explain(sql, `${phase}: punch list for one project`, `select * from punch_items where project_id = '${targetProjectId}'`);
  await explain(sql, `${phase}: RFI list for one project`, `select * from rfis where project_id = '${targetProjectId}'`);
  await explain(sql, `${phase}: documents for one project`, `select * from documents where project_id = '${targetProjectId}'`);
  await explain(sql, `${phase}: photos for one project`, `select * from photos where project_id = '${targetProjectId}'`);
  await explain(
    sql,
    `${phase}: daily digest sweep — open punch items across ALL projects`,
    `select p.number, u.email from punch_items p join users u on p.assignee_user_id = u.id join projects pr on p.project_id = pr.id where p.status <> 'closed'`,
  );
  await explain(
    sql,
    `${phase}: daily digest sweep — open RFIs across ALL projects`,
    `select r.number, u.email from rfis r join users u on r.ball_in_court_user_id = u.id join projects pr on r.project_id = pr.id where r.status = 'open'`,
  );
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const { queryClient: sql } = createDbClient(connectionString);

  await sql
    .begin(async (tx) => {
      const users = await tx`select id from users`;
      if (users.length === 0) throw new Error("no seeded users found — run pnpm --filter @siteops/db seed first");
      const userIds = users.map((u) => u.id as string);
      const systemUserId = userIds[0] as string;

      console.warn(`Creating ${NUM_PROJECTS} synthetic projects and bulk-generating ~160,000 rows across them...`);
      const projectIds: string[] = [];
      for (let i = 0; i < NUM_PROJECTS; i += 1) {
        const [proj] = await tx`
          insert into projects (name, created_by)
          values (${"Perf Test Project " + String(i)}, ${systemUserId})
          returning id
        `;
        if (!proj) throw new Error("synthetic project insert failed");
        projectIds.push(proj.id as string);
      }
      const targetProjectId = projectIds[0] as string;

      for (const pid of projectIds) {
        await tx`
          insert into punch_items (project_id, number, description, assignee_user_id, priority, status, created_by)
          select
            ${pid},
            'PERF-' || g,
            'Perf test punch item ' || g,
            (${tx.array(userIds)}::uuid[])[1 + (g % ${userIds.length})],
            (array['low','medium','high']::punch_item_priority[])[1 + (g % 3)],
            (array['open','ready_for_review','approved','closed']::punch_item_status[])[1 + (g % 4)],
            ${systemUserId}
          from generate_series(1, ${PUNCH_PER_PROJECT}) as g
        `;
        await tx`
          insert into rfis (project_id, number, subject, question, ball_in_court_user_id, status, created_by)
          select
            ${pid},
            'PERF-RFI-' || g,
            'Perf test RFI ' || g,
            'Does this matter for load?',
            (${tx.array(userIds)}::uuid[])[1 + (g % ${userIds.length})],
            (array['draft','open','answered','closed']::rfi_status[])[1 + (g % 4)],
            ${systemUserId}
          from generate_series(1, ${RFI_PER_PROJECT}) as g
        `;
        const [attachment] = await tx`
          insert into attachments (owner_type, owner_id, project_id, storage_key, filename, mime, size, uploaded_by)
          values ('perf_probe', ${pid}, ${pid}, 'perf/probe.bin', 'probe.bin', 'application/octet-stream', 1, ${systemUserId})
          returning id
        `;
        if (!attachment) throw new Error("attachment insert failed");
        await tx`
          insert into documents (project_id, current_attachment_id, title, created_by)
          select ${pid}, ${attachment.id}, 'Perf test document ' || g, ${systemUserId}
          from generate_series(1, ${DOC_PER_PROJECT}) as g
        `;
        await tx`
          insert into photos (project_id, attachment_id, uploaded_by)
          select ${pid}, ${attachment.id}, ${systemUserId}
          from generate_series(1, ${PHOTO_PER_PROJECT}) as g
        `;
      }

      const [totalsRow] = await tx`
        select
          (select count(*) from punch_items) + (select count(*) from rfis) + (select count(*) from documents) + (select count(*) from photos)
          as count
      `;
      console.warn(`\nTotal rows generated: ${totalsRow?.count as string}`);
      console.warn(`Target project for single-project queries: ${targetProjectId} (1 of ${NUM_PROJECTS} projects, ~${(100 / NUM_PROJECTS).toFixed(1)}% of rows)`);

      // Fresh, accurate planner statistics for a fair "AFTER" measurement.
      await tx`analyze punch_items`;
      await tx`analyze rfis`;
      await tx`analyze documents`;
      await tx`analyze photos`;
      await tx`analyze projects`;

      await runQueries(tx, "AFTER (indexed)", targetProjectId);

      console.warn("\nDropping Phase 8 indexes (transaction-local) to reproduce the pre-migration baseline...");
      await tx`drop index punch_items_project_id_idx`;
      await tx`drop index punch_items_assignee_user_id_idx`;
      await tx`drop index rfis_project_id_idx`;
      await tx`drop index documents_project_id_idx`;
      await tx`drop index photos_project_id_idx`;
      await tx`analyze punch_items`;
      await tx`analyze rfis`;
      await tx`analyze documents`;
      await tx`analyze photos`;

      await runQueries(tx, "BEFORE (no index)", targetProjectId);

      throw new Error("__PERF_CHECK_ROLLBACK__");
    })
    .catch((err: unknown) => {
      if (err instanceof Error && err.message === "__PERF_CHECK_ROLLBACK__") {
        console.warn("\nRolled back — no data or index changes persisted.");
        return;
      }
      throw err;
    });

  await sql.end();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
