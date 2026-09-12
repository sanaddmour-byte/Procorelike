import type { Database } from "@siteops/db";
import { syncPullQuerySchema, syncPushSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loadPermissionContext } from "../services/permission.service";
import * as syncService from "../services/sync.service";

export function syncRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get("/pull", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const query = syncPullQuerySchema.parse(req.query);
      const ctx = await loadPermissionContext(appDb, authUser.id, query.projectId);
      const result = await syncService.pullSyncRecords(
        appDb,
        authUser.id,
        ctx,
        query.projectId,
        query.entityType,
        query.since,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/push", validateBody(syncPushSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const results = await syncService.pushSyncRecords(
        appDb,
        authUser.id,
        ctx,
        req.body.projectId,
        req.body.entityType,
        req.body.records,
      );
      res.json({ results });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
