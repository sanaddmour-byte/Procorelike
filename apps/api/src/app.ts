import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { ApiDbClients } from "./db";
import type { Env } from "./env";
import { correlationMiddleware } from "./lib/correlation";
import { errorHandler } from "./lib/errors";
import { attachmentsRouter } from "./routes/attachments.routes";
import { authRouter } from "./routes/auth.routes";
import { billingRouter } from "./routes/billing.routes";
import { budgetRouter } from "./routes/budget.routes";
import { changeEventsRouter, changeOrdersRouter, potentialChangeOrdersRouter } from "./routes/change-management.routes";
import { checklistTemplatesRouter } from "./routes/checklist-templates.routes";
import { commitmentsRouter } from "./routes/commitments.routes";
import { companiesRouter } from "./routes/companies.routes";
import { correspondenceRouter } from "./routes/correspondence.routes";
import { cpmScheduleRouter } from "./routes/cpm-schedule.routes";
import { dailyLogsRouter } from "./routes/daily-logs.routes";
import { documentsRouter } from "./routes/documents.routes";
import { drawingsRouter } from "./routes/drawings.routes";
import { healthRouter } from "./routes/health.routes";
import { inspectionsRouter } from "./routes/inspections.routes";
import { internalRouter } from "./routes/internal.routes";
import { lookaheadRouter } from "./routes/lookahead.routes";
import { meetingItemsRouter, meetingsRouter } from "./routes/meetings.routes";
import { savedViewsRouter } from "./routes/saved-views.routes";
import { pdfCommentsRouter } from "./routes/pdf-comments.routes";
import { photosRouter } from "./routes/photos.routes";
import { projectsRouter } from "./routes/projects.routes";
import { punchItemsRouter } from "./routes/punch-items.routes";
import { recordLinksRouter } from "./routes/record-links.routes";
import { rfisRouter } from "./routes/rfis.routes";
import { scheduleRouter } from "./routes/schedule.routes";
import { scheduleConstraintsRouter } from "./routes/schedule-constraints.routes";
import { scheduleProgressRouter } from "./routes/schedule-progress.routes";
import { safetyIncidentsRouter, safetyObservationsRouter } from "./routes/safety.routes";
import { submittalsRouter } from "./routes/submittals.routes";
import { syncRouter } from "./routes/sync.routes";
import { tmTicketsRouter } from "./routes/tm-ticket.routes";
import { createS3Client } from "./lib/s3";
import { createMailer } from "./lib/mailer";

export function createApp(env: Env, clients: ApiDbClients): Express {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  // Default 100kb is fine for every other endpoint, but a schedule import
  // (docs/SCHEDULING.md A2: "handle a 5,000-task file") sends the whole
  // source file as JSON text -- a few MB for a large P6 XER/MSP XML export.
  app.use(express.json({ limit: "20mb" }));
  app.use(correlationMiddleware);

  const authDeps = { authDb: clients.authDb.db, appDb: clients.appDb.db, env };
  const s3 = createS3Client(env);
  const mailer = createMailer(env);

  app.use("/health", healthRouter());
  app.use("/auth", authRouter(authDeps, env));
  app.use("/projects", projectsRouter(clients.appDb.db, env));
  app.use("/companies", companiesRouter(clients.appDb.db, env));
  app.use("/attachments", attachmentsRouter(clients.appDb.db, s3, env));
  app.use("/daily-logs", dailyLogsRouter(clients.appDb.db, env));
  app.use("/punch-items", punchItemsRouter(clients.appDb.db, env));
  app.use("/photos", photosRouter(clients.appDb.db, env));
  app.use("/documents", documentsRouter(clients.appDb.db, env));
  app.use("/checklist-templates", checklistTemplatesRouter(clients.appDb.db, env));
  app.use("/inspections", inspectionsRouter(clients.appDb.db, env));
  app.use("/budget-line-items", budgetRouter(clients.appDb.db, env));
  app.use("/commitments", commitmentsRouter(clients.appDb.db, env));
  app.use("/change-events", changeEventsRouter(clients.appDb.db, env));
  app.use("/potential-change-orders", potentialChangeOrdersRouter(clients.appDb.db, env));
  app.use("/change-orders", changeOrdersRouter(clients.appDb.db, env));
  app.use("/payment-applications", billingRouter(clients.appDb.db, env));
  app.use("/meetings", meetingsRouter(clients.appDb.db, env));
  app.use("/meeting-items", meetingItemsRouter(clients.appDb.db, env));
  app.use("/saved-views", savedViewsRouter(clients.appDb.db, env));
  app.use("/drawings", drawingsRouter(clients.appDb.db, env));
  app.use("/rfis", rfisRouter(clients.appDb.db, env));
  app.use("/submittals", submittalsRouter(clients.appDb.db, env));
  app.use("/schedule-tasks", scheduleRouter(clients.appDb.db, env));
  app.use("/safety-incidents", safetyIncidentsRouter(clients.appDb.db, env));
  app.use("/safety-observations", safetyObservationsRouter(clients.appDb.db, env));
  app.use("/tm-tickets", tmTicketsRouter(clients.appDb.db, env));
  app.use("/correspondence", correspondenceRouter(clients.appDb.db, env));
  app.use("/schedules", cpmScheduleRouter(clients.appDb.db, env));
  app.use("/lookahead", lookaheadRouter(clients.appDb.db, env));
  app.use("/schedule-constraints", scheduleConstraintsRouter(clients.appDb.db, env));
  app.use("/schedule-progress-updates", scheduleProgressRouter(clients.appDb.db, env));
  app.use("/record-links", recordLinksRouter(clients.appDb.db, env));
  app.use("/pdf-comments", pdfCommentsRouter(clients.appDb.db, env));
  app.use("/sync", syncRouter(clients.appDb.db, env));
  app.use("/internal", internalRouter(clients.authDb.db, mailer, env));

  app.use(errorHandler);
  return app;
}
