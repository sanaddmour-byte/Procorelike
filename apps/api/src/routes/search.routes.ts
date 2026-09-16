import type { Database } from "@siteops/db";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { requireAuth } from "../middleware/auth";
import { loadPermissionContext } from "../services/permission.service";
import { globalSearch } from "../services/search.service";

/**
 * A single cross-entity endpoint backing the web app's global search
 * (Cmd/Ctrl+K). `projectId` is optional -- Projects/Companies always
 * search, everything else needs it. A `projectId` the caller isn't a
 * member of degrades to "no project-scoped results" rather than a 403,
 * since a search box failing outright over one bad/stale project id
 * would be a worse experience than just narrowing the result set.
 */
export function searchRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const projectIdParam = typeof req.query.projectId === "string" ? req.query.projectId : undefined;

      let projectId: string | undefined;
      let ctx;
      if (projectIdParam) {
        try {
          ctx = await loadPermissionContext(appDb, authUser.id, projectIdParam);
          projectId = projectIdParam;
        } catch {
          projectId = undefined;
        }
      }

      const results = await globalSearch(appDb, authUser.id, q, projectId, ctx);
      res.json(results);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
