import type { Database } from "@siteops/db";
import { createScheduleConstraintSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { findTaskProjectId } from "../services/cpm-schedule.service";
import * as lookaheadService from "../services/lookahead.service";
import { loadPermissionContext } from "../services/permission.service";

export function scheduleConstraintsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createScheduleConstraintSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = await findTaskProjectId(appDb, authUser.id, req.body.taskId);
      if (!projectId) throw new NotFoundError("Schedule task not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const constraint = await lookaheadService.createScheduleConstraint(appDb, authUser.id, ctx, req.body);
      res.status(201).json(constraint);
    } catch (err) {
      next(err);
    }
  });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const { projectId, taskId } = req.query;
      if (typeof taskId === "string") {
        const resolvedTaskProjectId = await findTaskProjectId(appDb, authUser.id, taskId);
        const resolvedProjectId = typeof projectId === "string" ? projectId : resolvedTaskProjectId;
        if (!resolvedProjectId) throw new NotFoundError("projectId or a valid taskId is required");
        const ctx = await loadPermissionContext(appDb, authUser.id, resolvedProjectId);
        const constraints = await lookaheadService.listScheduleConstraintsForTask(appDb, authUser.id, ctx, taskId);
        res.json(constraints);
        return;
      }
      if (typeof projectId !== "string") throw new NotFoundError("projectId or taskId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const constraints = await lookaheadService.listScheduleConstraintsForProject(appDb, authUser.id, ctx, projectId);
      res.json(constraints);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:constraintId/clear", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const constraintId = paramAsString(req.params.constraintId);
      if (!constraintId) throw new NotFoundError("Schedule constraint not found");
      const projectId = await lookaheadService.findConstraintProjectId(appDb, authUser.id, constraintId);
      if (!projectId) throw new NotFoundError("Schedule constraint not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const constraint = await lookaheadService.clearScheduleConstraint(appDb, authUser.id, ctx, constraintId);
      res.json(constraint);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
