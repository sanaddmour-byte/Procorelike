import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { auditColumns, idColumn } from "./columns";

export const companyTypeEnum = pgEnum("company_type", ["gc", "sub", "consultant", "owner"]);

export const projectRoleEnum = pgEnum("project_role", [
  "owner_admin",
  "project_manager",
  "project_engineer",
  "superintendent",
  "foreman",
  "qa_qc",
  "safety_officer",
  "subcontractor",
  "consultant",
  "client_viewer",
]);

export const permissionModuleEnum = pgEnum("permission_module", [
  "directory",
  "documents",
  "drawings",
  "rfis",
  "submittals",
  "daily_log",
  "punch_list",
  "photos",
  "inspections",
  "budget",
  "commitments",
  "change_management",
  "progress_billing",
  "meetings",
  "schedule",
  "safety",
  "tm_tickets",
  "reports",
  "correspondence",
  "prime_contract",
  "direct_costs",
  "prequalification",
  "bidding",
  "estimating",
]);

export const permissionLevelEnum = pgEnum("permission_level", ["none", "read", "standard", "admin"]);

export const locationLevelTypeEnum = pgEnum("location_level_type", [
  "building",
  "level",
  "zone",
  "room",
]);

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export const companies = pgTable("companies", {
  id: idColumn(),
  name: varchar("name", { length: 200 }).notNull(),
  type: companyTypeEnum("type").notNull(),
  /**
   * Branding for PDF letterheads (RFI/Submittal/Change Order/Correspondence
   * exports) -- stored inline as base64 rather than through the
   * project-scoped `attachments`/S3 pipeline, since a company's logo is
   * deliberately not tied to any one project (companies has no RLS policy
   * for the same reason). Small PNGs only; see uploadCompanyLogoSchema's
   * size cap.
   */
  logoDataBase64: text("logo_data_base64"),
  logoMime: varchar("logo_mime", { length: 100 }),
  ...auditColumns(),
});

export const users = pgTable(
  "users",
  {
    id: idColumn(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    localePref: varchar("locale_pref", { length: 5 }).notNull().default("en"),
    totpSecret: text("totp_secret"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    /** Procore Directory shows both a business (office) and a mobile number per person -- self-service only, see updateMyProfileSchema. */
    businessPhone: varchar("business_phone", { length: 50 }),
    mobilePhone: varchar("mobile_phone", { length: 50 }),
    ...auditColumns(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const refreshTokens = pgTable("refresh_tokens", {
  id: idColumn(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  deviceLabel: varchar("device_label", { length: 200 }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invites = pgTable("invites", {
  id: idColumn(),
  email: varchar("email", { length: 320 }).notNull(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  role: projectRoleEnum("role").notNull(),
  tokenHash: text("token_hash").notNull(),
  invitedBy: uuid("invited_by")
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userCompanies = pgTable("user_companies", {
  id: idColumn(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  title: varchar("title", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: idColumn(),
    name: varchar("name", { length: 200 }).notNull(),
    address: text("address"),
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    localeDefault: varchar("locale_default", { length: 5 }).notNull().default("en"),
    timezone: varchar("timezone", { length: 100 }).notNull().default("Asia/Amman"),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    /** A change order at or above this amount requires a second approver from a different company (packages/shared's requiresSecondApprover). Configurable per project; docs/DATA_MODEL.md §9. */
    changeOrderThreshold: numeric("change_order_threshold", { precision: 14, scale: 2 }).notNull().default("5000"),
    /** Default ISO 4217 currency for financial records on this project that don't carry their own currency column (direct costs, change orders, payment applications). Prime contracts/budget lines/commitments still carry their own currency for the rarer case a single project mixes currencies. */
    defaultCurrency: varchar("default_currency", { length: 3 }).notNull().default("USD"),
    /**
     * Server-generated, immutable alias for Phase 19's email-to-project
     * logging: `<token>@INBOUND_EMAIL_DOMAIN` is the address a registered
     * project member CCs or forwards mail to, so it gets auto-logged as
     * incoming Correspondence (inbound-email.service.ts). A plain uuid --
     * same generation mechanism as every id column -- rather than a
     * shorter human-typed code, since nobody types this, they paste/CC it.
     */
    inboundEmailToken: uuid("inbound_email_token").notNull().defaultRandom(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    ...auditColumns(),
  },
  (table) => [uniqueIndex("projects_inbound_email_token_unique").on(table.inboundEmailToken)],
);

export const projectCompanies = pgTable(
  "project_companies",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    roleOnProject: varchar("role_on_project", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("project_companies_project_id_idx").on(table.projectId)],
);

export const projectUsers = pgTable(
  "project_users",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    role: projectRoleEnum("role").notNull(),
    permissionTemplateId: uuid("permission_template_id").references(() => permissionTemplates.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("project_users_project_user_unique").on(table.projectId, table.userId),
    // Every RLS policy in the system subqueries this table by user_id alone
    // (`WHERE user_id = current_setting('app.user_id')`) -- the unique
    // index above is (project_id, user_id) and can't serve a user_id-only
    // lookup, so without this every authenticated request would seq-scan
    // project_users. The single highest-leverage index in the schema.
    index("project_users_user_id_idx").on(table.userId),
  ],
);

export const permissionTemplates = pgTable("permission_templates", {
  id: idColumn(),
  name: varchar("name", { length: 200 }).notNull(),
  /** Record<Module, PermissionLevel> — see @siteops/shared ModuleLevels. */
  levels: jsonb("levels").notNull().$type<Record<string, string>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projectUserPermissions = pgTable(
  "project_user_permissions",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    module: permissionModuleEnum("module").notNull(),
    level: permissionLevelEnum("level").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("project_user_permissions_unique").on(
      table.projectId,
      table.userId,
      table.module,
    ),
  ],
);

/** A user's saved filter for one module's list screen (Phase 7) — private to that user, not shared project-wide. `filters` is a free-form bag of the screen's own filter state (e.g. `{status: "open"}`), interpreted client-side; the server just stores and returns it. */
export const savedViews = pgTable(
  "saved_views",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    module: permissionModuleEnum("module").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    filters: jsonb("filters").notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("saved_views_unique_name").on(table.projectId, table.userId, table.module, table.name)],
);

// ---------------------------------------------------------------------------
// Shared reference data
// ---------------------------------------------------------------------------

export const costCodes = pgTable(
  "cost_codes",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    code: varchar("code", { length: 50 }).notNull(),
    description: text("description").notNull(),
    wbsParentId: uuid("wbs_parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("cost_codes_project_id_idx").on(table.projectId)],
);

export const locations = pgTable(
  "locations",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    parentId: uuid("parent_id"),
    levelType: locationLevelTypeEnum("level_type").notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("locations_project_id_idx").on(table.projectId)],
);

export const trades = pgTable("trades", {
  id: idColumn(),
  name: varchar("name", { length: 200 }).notNull(),
});

export const specificationsSections = pgTable(
  "specifications_sections",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    csiCode: varchar("csi_code", { length: 20 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
  },
  (table) => [index("specifications_sections_project_id_idx").on(table.projectId)],
);

export const attachments = pgTable(
  "attachments",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    ownerType: varchar("owner_type", { length: 50 }).notNull(),
    ownerId: uuid("owner_id").notNull(),
    storageKey: text("storage_key").notNull(),
    filename: varchar("filename", { length: 500 }).notNull(),
    mime: varchar("mime", { length: 200 }).notNull(),
    size: integer("size").notNull(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("attachments_project_id_idx").on(table.projectId),
    // Every module's "get attachments for this record" query filters on
    // this pair (owner_type is fixed per call site, owner_id is the
    // record's own id) -- the hottest access pattern on this table.
    index("attachments_owner_idx").on(table.ownerType, table.ownerId),
  ],
);

export const auditLog = pgTable("audit_log", {
  id: idColumn(),
  actorId: uuid("actor_id").references(() => users.id),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: varchar("ip", { length: 64 }),
  correlationId: varchar("correlation_id", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: idColumn(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  type: varchar("type", { length: 100 }).notNull(),
  payload: jsonb("payload").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const numberSequences = pgTable(
  "number_sequences",
  {
    id: idColumn(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    sequenceKey: varchar("sequence_key", { length: 100 }).notNull(),
    nextValue: integer("next_value").notNull().default(1),
  },
  (table) => [
    uniqueIndex("number_sequences_project_key_unique").on(table.projectId, table.sequenceKey),
  ],
);

export const recordLinks = pgTable("record_links", {
  id: idColumn(),
  sourceType: varchar("source_type", { length: 100 }).notNull(),
  sourceId: uuid("source_id").notNull(),
  targetType: varchar("target_type", { length: 100 }).notNull(),
  targetId: uuid("target_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
