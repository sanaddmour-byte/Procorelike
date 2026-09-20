import type { Database } from "@siteops/db";
import { isModule, upsertWorkflowTransitionRuleSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loadPermissionContext } from "../services/permission.service";
import * as workflowRuleService from "../services/workflow-rule.service";

export function workflowTransitionRulesRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      const moduleParam = typeof req.query.module === "string" ? req.query.module : undefined;
      if (!projectId) throw new NotFoundError("projectId query param required");
      if (moduleParam !== undefined && !isModule(moduleParam)) throw new NotFoundError("module query param is not a recognized module");
      // Recomputed as a single expression rather than relying on the guard above to
      // narrow `moduleParam` across the following statements -- some TypeScript
      // resolution setups don't carry a type predicate's narrowing that far.
      const module = moduleParam !== undefined && isModule(moduleParam) ? moduleParam : undefined;
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const rules = await workflowRuleService.listWorkflowTransitionRules(appDb, authUser.id, ctx, {
        projectId,
        module,
      });
      res.json(rules);
    } catch (err) {
      next(err);
    }
  });

  router.put("/", validateBody(upsertWorkflowTransitionRuleSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const rule = await workflowRuleService.upsertWorkflowTransitionRule(appDb, authUser.id, ctx, req.body);
      res.json(rule);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:ruleId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ruleId = paramAsString(req.params.ruleId);
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      if (!ruleId) throw new NotFoundError("Workflow transition rule not found");
      if (!projectId) throw new NotFoundError("projectId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      await workflowRuleService.deleteWorkflowTransitionRule(appDb, authUser.id, ctx, ruleId, { projectId });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
