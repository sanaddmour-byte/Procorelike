import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { ApiDbClients } from "./db";
import type { Env } from "./env";
import { correlationMiddleware } from "./lib/correlation";
import { errorHandler } from "./lib/errors";
import { attachmentsRouter } from "./routes/attachments.routes";
import { authRouter } from "./routes/auth.routes";
import { companiesRouter } from "./routes/companies.routes";
import { healthRouter } from "./routes/health.routes";
import { projectsRouter } from "./routes/projects.routes";
import { createS3Client } from "./lib/s3";

export function createApp(env: Env, clients: ApiDbClients): Express {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(correlationMiddleware);

  const authDeps = { authDb: clients.authDb.db, appDb: clients.appDb.db, env };
  const s3 = createS3Client(env);

  app.use("/health", healthRouter());
  app.use("/auth", authRouter(authDeps, env));
  app.use("/projects", projectsRouter(clients.appDb.db, env));
  app.use("/companies", companiesRouter(clients.appDb.db, env));
  app.use("/attachments", attachmentsRouter(clients.appDb.db, s3, env));

  app.use(errorHandler);
  return app;
}
