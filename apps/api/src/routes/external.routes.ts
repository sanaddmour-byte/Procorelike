import type { Database } from "@siteops/db";
import { Router, type NextFunction, type Request, type Response } from "express";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireApiKey } from "../middleware/api-key-auth";
import { listBudgetLineItems } from "../services/budget.service";
import { loadPermissionContext } from "../services/permission.service";
import { listMyProjects } from "../services/project.service";

/**
 * A deliberately small external API surface -- the honest counterpart to
 * the Admin Console's API keys. Authenticated via X-API-Key instead of a
 * JWT (see middleware/api-key-auth.ts), which resolves to the key's
 * creator and populates req.authUser identically to requireAuth; every
 * handler below calls the exact same service functions the JWT-authenticated
 * /projects and /budget-line-items routes call, so permissions/RLS are
 * reused unchanged rather than re-implemented for API-key callers. Two
 * endpoints, not a full mirror of the app's API -- extend deliberately,
 * one real endpoint at a time, the same way WEBHOOK_EVENT_TYPES stays small.
 */
export function externalRouter(appDb: Database, authDb: Database): Router {
  const router = Router();
  router.use(requireApiKey(authDb));

  router.get("/v1/projects", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireApiKey did not populate req.authUser");
      const projects = await listMyProjects(appDb, authUser.id);
      res.json(projects);
    } catch (err) {
      next(err);
    }
  });

  router.get("/v1/projects/:projectId/budget-line-items", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireApiKey did not populate req.authUser");
      const projectId = paramAsString(req.params.projectId);
      if (!projectId) throw new NotFoundError("Project not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const lineItems = await listBudgetLineItems(appDb, authUser.id, ctx, projectId);
      res.json(lineItems);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
