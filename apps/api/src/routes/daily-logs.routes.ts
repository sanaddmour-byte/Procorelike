import type { Database } from "@siteops/db";
import { createDailyLogSchema, updateDailyLogSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as dailyLogService from "../services/daily-log.service";
import { findProjectById, loadPermissionContext } from "../services/permission.service";

export function dailyLogsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createDailyLogSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const project = await findProjectById(appDb, authUser.id, req.body.projectId);
      if (!project) throw new NotFoundError("Project not found");
      const log = await dailyLogService.createDailyLog(
        appDb,
        authUser.id,
        ctx,
        project.lat ? Number(project.lat) : null,
        project.lng ? Number(project.lng) : null,
        req.body,
      );
      res.status(201).json(log);
    } catch (err) {
      next(err);
    }
  });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = req.query.projectId;
      if (typeof projectId !== "string") throw new NotFoundError("projectId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const logs = await dailyLogService.listDailyLogs(appDb, authUser.id, ctx, projectId);
      res.json(logs);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Daily log not found");
      const log = await dailyLogService.findDailyLogById(appDb, authUser.id, id);
      if (!log) throw new NotFoundError("Daily log not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, log.projectId);
      const detail = await dailyLogService.getDailyLog(appDb, authUser.id, ctx, id);
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", validateBody(updateDailyLogSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Daily log not found");
      const log = await dailyLogService.findDailyLogById(appDb, authUser.id, id);
      if (!log) throw new NotFoundError("Daily log not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, log.projectId);
      const updated = await dailyLogService.updateDailyLog(appDb, authUser.id, ctx, id, req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
