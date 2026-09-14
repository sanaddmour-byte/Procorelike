import type { Database } from "@siteops/db";
import { createPdfSketchSchema, pdfCommentRecordTypeSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loadPermissionContext } from "../services/permission.service";
import * as pdfSketchesService from "../services/pdf-sketches.service";

export function pdfSketchesRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createPdfSketchSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await pdfSketchesService.createPdfSketch(appDb, authUser.id, ctx, req.body);
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
      const parsedType = pdfCommentRecordTypeSchema.parse(recordType);
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const rows = await pdfSketchesService.listPdfSketches(appDb, authUser.id, ctx, parsedType, recordId);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
