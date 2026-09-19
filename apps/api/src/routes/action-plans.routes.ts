import type { Database } from "@siteops/db";
import { instantiateActionPlanSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import * as actionPlanService from "../services/action-plan.service";
import { NotFoundError } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loadPermissionContext } from "../services/permission.service";

export function actionPlansRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      if (!projectId) throw new NotFoundError("projectId query param required");
      const sourceType = req.query.sourceType;
      const sourceId = req.query.sourceId;
      const sourceFilter = typeof sourceType === "string" && typeof sourceId === "string" ? { sourceType, sourceId } : undefined;
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const plans = await actionPlanService.listActionPlans(appDb, authUser.id, ctx, projectId, sourceFilter);
      res.json(plans);
    } catch (err) {
      next(err);
    }
  });

  router.post("/", validateBody(instantiateActionPlanSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const plan = await actionPlanService.instantiateActionPlan(appDb, authUser.id, ctx, req.body);
      res.status(201).json(plan);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
