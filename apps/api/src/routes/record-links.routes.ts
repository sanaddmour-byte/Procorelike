import type { Database } from "@siteops/db";
import { createRecordLinkSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loadPermissionContext } from "../services/permission.service";
import * as recordLinksService from "../services/record-links.service";

export function recordLinksRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createRecordLinkSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await recordLinksService.createRecordLink(appDb, authUser.id, ctx, req.body);
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  });

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const { projectId, recordType, recordId } = req.query;
      if (typeof projectId !== "string" || typeof recordType !== "string" || typeof recordId !== "string") {
        throw new NotFoundError("projectId, recordType and recordId query params are required");
      }
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const rows = await recordLinksService.listRecordLinksFor(appDb, authUser.id, ctx, recordType, recordId);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Record link not found");
      const projectId = req.query.projectId;
      if (typeof projectId !== "string") throw new NotFoundError("projectId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      await recordLinksService.deleteRecordLink(appDb, authUser.id, ctx, id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
