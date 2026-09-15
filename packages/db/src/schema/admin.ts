import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { idColumn } from "./columns";
import { companies, users } from "./core";

/**
 * Company-scoped API keys — the honest in-app stand-in for SSO/ERP
 * integration (docs decision: no fake external identity provider). A key
 * authenticates AS its `createdBy` user (apps/api's requireApiKey
 * middleware resolves it to that user and populates req.authUser exactly
 * like a JWT would), so every downstream permission/RLS check is reused
 * unchanged rather than needing a separate authorization model.
 *
 * `keyHash` is a plain sha256 (not argon2 like passwords) because
 * authentication here must look the key up BY its hash in O(1) — there is
 * no separate identifier to look up by first, unlike a password login.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    name: varchar("name", { length: 200 }).notNull(),
    keyHash: text("key_hash").notNull(),
    /** First chars of the plaintext key, stored only for display ("sk_live_ab12...") so a user can tell keys apart without ever seeing the full secret again. */
    keyPrefix: varchar("key_prefix", { length: 20 }).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("api_keys_company_id_idx").on(table.companyId),
    uniqueIndex("api_keys_key_hash_unique").on(table.keyHash),
  ],
);

/**
 * A company's subscription to a small, deliberately fixed set of real
 * event types (@siteops/shared's WEBHOOK_EVENT_TYPES) — not a fake
 * blanket event bus. `secret` signs each delivery's payload
 * (HMAC-SHA256, packages/shared/src/webhook-signing.ts) so the receiver
 * can verify it actually came from SiteOps.
 */
export const webhookSubscriptions = pgTable(
  "webhook_subscriptions",
  {
    id: idColumn(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    eventTypes: jsonb("event_types").notNull().$type<string[]>(),
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("webhook_subscriptions_company_id_idx").on(table.companyId)],
);

/** Best-effort delivery log — one row per attempted POST, no retry/backoff queue (explicit scope-down, not an oversight). */
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: idColumn(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => webhookSubscriptions.id),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    statusCode: integer("status_code"),
    error: text("error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("webhook_deliveries_subscription_id_idx").on(table.subscriptionId)],
);
