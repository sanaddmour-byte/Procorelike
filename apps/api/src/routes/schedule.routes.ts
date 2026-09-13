import type { Database } from "@siteops/db";
import { createScheduleTaskSchema, transitionScheduleTaskStatusSchema, updateScheduleTaskSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loadPermissionContext } from "../services/permission.service";
import * as scheduleService from "../services/schedule.service";

export function scheduleRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  async function loadCtx(authUserId: string, taskId: string) {
    const task = await scheduleService.findScheduleTaskById(appDb, authUserId, taskId);
    if (!task) throw new NotFoundError("Schedule task not found");
    return { ctx: await loadPermissionContext(appDb, authUserId, task.projectId), task };
  }

  router.post("/", validateBody(createScheduleTaskSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await scheduleService.createScheduleTask(appDb, authUser.id, ctx, req.body);
      res.status(201).json(row);
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
      const rows = await scheduleService.listScheduleTasks(appDb, authUser.id, ctx, projectId);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", validateBody(updateScheduleTaskSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Schedule task not found");
      const { ctx } = await loadCtx(authUser.id, id);
      const updated = await scheduleService.updateScheduleTask(appDb, authUser.id, ctx, id, req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/transition",
    validateBody(transitionScheduleTaskStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Schedule task not found");
        const { ctx } = await loadCtx(authUser.id, id);
        const updated = await scheduleService.transitionScheduleTaskStatus(appDb, authUser.id, ctx, id, req.body);
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
