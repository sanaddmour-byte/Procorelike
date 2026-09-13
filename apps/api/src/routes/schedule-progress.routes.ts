import type { Database } from "@siteops/db";
import { rejectScheduleProgressUpdateSchema, submitScheduleProgressUpdateSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { findTaskProjectId } from "../services/cpm-schedule.service";
import { loadPermissionContext } from "../services/permission.service";
import * as progressService from "../services/schedule-progress.service";

export function scheduleProgressRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(submitScheduleProgressUpdateSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = await findTaskProjectId(appDb, authUser.id, req.body.taskId);
      if (!projectId) throw new NotFoundError("Schedule task not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const update = await progressService.submitScheduleProgressUpdate(appDb, authUser.id, ctx, req.body);
      res.status(201).json(update);
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
      const updates = await progressService.listPendingProgressUpdates(appDb, authUser.id, ctx, projectId);
      res.json(updates);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:updateId/accept", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const updateId = paramAsString(req.params.updateId);
      if (!updateId) throw new NotFoundError("Progress update not found");
      const projectId = await progressService.findProgressUpdateProjectId(appDb, authUser.id, updateId);
      if (!projectId) throw new NotFoundError("Progress update not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const update = await progressService.acceptScheduleProgressUpdate(appDb, authUser.id, ctx, updateId);
      res.json(update);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:updateId/reject",
    validateBody(rejectScheduleProgressUpdateSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const updateId = paramAsString(req.params.updateId);
        if (!updateId) throw new NotFoundError("Progress update not found");
        const projectId = await progressService.findProgressUpdateProjectId(appDb, authUser.id, updateId);
        if (!projectId) throw new NotFoundError("Progress update not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
        const update = await progressService.rejectScheduleProgressUpdate(appDb, authUser.id, ctx, updateId, req.body);
        res.json(update);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
