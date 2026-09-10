import { numeric, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { idColumn } from "./columns";
import { attachments, projects, users } from "./core";

export const photoAlbums = pgTable("photo_albums", {
  id: idColumn(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  name: varchar("name", { length: 200 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const photos = pgTable("photos", {
  id: idColumn(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  albumId: uuid("album_id").references(() => photoAlbums.id),
  attachmentId: uuid("attachment_id")
    .notNull()
    .references(() => attachments.id),
  takenAt: timestamp("taken_at", { withTimezone: true }),
  gpsLat: numeric("gps_lat", { precision: 9, scale: 6 }),
  gpsLng: numeric("gps_lng", { precision: 9, scale: 6 }),
  tags: text("tags").array(),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
