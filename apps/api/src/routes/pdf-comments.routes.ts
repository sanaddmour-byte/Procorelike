import type { Database } from "@siteops/db";
import { createPdfCommentSchema, linkPdfCommentToRfiSchema, pdfCommentRecordTypeSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loadPermissionContext } from "../services/permission.service";
import * as pdfCommentsService from "../services/pdf-comments.service";

export function pdfCommentsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createPdfCommentSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await pdfCommentsService.createPdfComment(appDb, authUser.id, ctx, req.body);
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  });

  router.get("/linked-to-rfi", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const { projectId, rfiId } = req.query;
      if (typeof projectId !== "string" || typeof rfiId !== "string") {
        throw new NotFoundError("projectId and rfiId query params are required");
      }
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const rows = await pdfCommentsService.listPdfCommentsLinkedToRfi(appDb, authUser.id, ctx, rfiId);
      res.json(rows);
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
      const rows = await pdfCommentsService.listPdfComments(appDb, authUser.id, ctx, parsedType, recordId);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id/link", validateBody(linkPdfCommentToRfiSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("PDF comment not found");
      const projectId = req.query.projectId;
      if (typeof projectId !== "string") throw new NotFoundError("projectId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const row = await pdfCommentsService.setPdfCommentRfiLink(appDb, authUser.id, ctx, id, req.body.linkedRfiId);
      res.json(row);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
