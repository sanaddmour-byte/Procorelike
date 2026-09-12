import * as SQLite from "expo-sqlite";

/**
 * Local offline store (docs/ARCHITECTURE.md §6). Uses expo-sqlite directly
 * rather than WatermelonDB (the stack choice in docs/CLAUDE.md §3) — see
 * docs/ROADMAP.md's Phase 2 gate report for why: WatermelonDB's SQLite
 * adapter needs a compiled custom dev client (no Expo Go support), and its
 * LokiJS adapter's persistence story is web/IndexedDB-oriented, not React
 * Native. expo-sqlite is Expo Go-compatible and official. The repository
 * layer below is written so swapping the storage engine later (e.g. once
 * real device testing can verify a WatermelonDB dev-client build) only
 * touches this file and the two `*-repo.ts` files, not the sync engine or
 * any screen.
 */

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate();
  }
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync("siteops.db");
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS daily_logs (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      log_date TEXT NOT NULL,
      notes TEXT,
      locked_at TEXT,
      base_revision INTEGER,
      base_snapshot TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      conflict_data TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS punch_items (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      number TEXT,
      description TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'open',
      due_date TEXT,
      base_revision INTEGER,
      base_snapshot TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      conflict_data TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outbox (
      queue_id TEXT PRIMARY KEY NOT NULL,
      entity_type TEXT NOT NULL,
      local_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );
  `);
  return db;
}
