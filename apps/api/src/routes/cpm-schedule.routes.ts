import type { Database } from "@siteops/db";
import { importScheduleSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as cpmScheduleService from "../services/cpm-schedule.service";
import { loadPermissionContext } from "../services/permission.service";

export function cpmScheduleRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/import", validateBody(importScheduleSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const result = await cpmScheduleService.importSchedule(appDb, authUser.id, ctx, req.body);
      res.status(201).json(result);
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
      const result = await cpmScheduleService.getScheduleForProject(appDb, authUser.id, ctx, projectId);
      if (!result) throw new NotFoundError("No schedule found for this project");
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get("/versions/:versionId/tasks", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const versionId = paramAsString(req.params.versionId);
      if (!versionId) throw new NotFoundError("Schedule version not found");
      const projectId = await cpmScheduleService.findVersionProjectId(appDb, authUser.id, versionId);
      if (!projectId) throw new NotFoundError("Schedule version not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const result = await cpmScheduleService.listVersionTasks(appDb, authUser.id, ctx, versionId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
