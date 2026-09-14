import type { Database } from "@siteops/db";
import { createCorrectiveActionSchema, transitionCorrectiveActionStatusSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as correctiveActionService from "../services/corrective-action.service";
import { loadPermissionContext } from "../services/permission.service";

export function correctiveActionsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createCorrectiveActionSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await correctiveActionService.createCorrectiveAction(appDb, authUser.id, ctx, req.body);
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
      const sourceType = req.query.sourceType;
      const sourceId = req.query.sourceId;
      const sourceFilter =
        typeof sourceType === "string" && typeof sourceId === "string" ? { sourceType, sourceId } : undefined;
      const rows = await correctiveActionService.listCorrectiveActions(appDb, authUser.id, ctx, projectId, sourceFilter);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/transition",
    validateBody(transitionCorrectiveActionStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Corrective action not found");
        const action = await correctiveActionService.findCorrectiveActionById(appDb, authUser.id, id);
        if (!action) throw new NotFoundError("Corrective action not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, action.projectId);
        const updated = await correctiveActionService.transitionCorrectiveActionStatus(appDb, authUser.id, ctx, id, req.body);
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
