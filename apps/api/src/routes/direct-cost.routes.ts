import type { Database } from "@siteops/db";
import { createDirectCostSchema, transitionDirectCostStatusSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as directCostService from "../services/direct-cost.service";
import { loadPermissionContext } from "../services/permission.service";

export function directCostRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createDirectCostSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await directCostService.createDirectCost(appDb, authUser.id, ctx, req.body);
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
      const rows = await directCostService.listDirectCosts(appDb, authUser.id, ctx, projectId);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/transition",
    validateBody(transitionDirectCostStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Direct cost not found");
        const directCost = await directCostService.findDirectCostById(appDb, authUser.id, id);
        if (!directCost) throw new NotFoundError("Direct cost not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, directCost.projectId);
        const updated = await directCostService.transitionDirectCostStatus(appDb, authUser.id, ctx, id, req.body.toStatus);
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
