import type { Database } from "@siteops/db";
import { createDocumentFolderSchema, createDocumentSchema, listDocumentsQuerySchema, updateDocumentSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as documentService from "../services/document.service";
import { loadPermissionContext } from "../services/permission.service";

export function documentsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/folders", validateBody(createDocumentFolderSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const folder = await documentService.createDocumentFolder(appDb, authUser.id, ctx, req.body);
      res.status(201).json(folder);
    } catch (err) {
      next(err);
    }
  });

  router.get("/folders", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = req.query.projectId;
      if (typeof projectId !== "string") throw new NotFoundError("projectId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const folders = await documentService.listDocumentFolders(appDb, authUser.id, ctx, projectId);
      res.json(folders);
    } catch (err) {
      next(err);
    }
  });

  router.post("/", validateBody(createDocumentSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const document = await documentService.createDocument(appDb, authUser.id, ctx, req.body);
      res.status(201).json(document);
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
      const folderId = typeof req.query.folderId === "string" ? req.query.folderId : null;
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const listQuery = listDocumentsQuerySchema.parse({
        search: req.query.search,
        sort: req.query.sort,
        direction: req.query.direction,
        page: req.query.page,
        pageSize: req.query.pageSize,
      });
      const { rows, total } = await documentService.listDocuments(appDb, authUser.id, ctx, projectId, folderId, listQuery);
      // Backward compatible: the body is always a plain array (see rfis.routes.ts's
      // GET / for the full rationale), `X-Total-Count` is purely additive.
      res.setHeader("X-Total-Count", String(total));
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Document not found");
      const document = await documentService.findDocumentById(appDb, authUser.id, id);
      if (!document) throw new NotFoundError("Document not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, document.projectId);
      const detail = await documentService.getDocument(appDb, authUser.id, ctx, id);
      if (!detail) throw new NotFoundError("Document not found");
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", validateBody(updateDocumentSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Document not found");
      const document = await documentService.findDocumentById(appDb, authUser.id, id);
      if (!document) throw new NotFoundError("Document not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, document.projectId);
      const updated = await documentService.updateDocument(appDb, authUser.id, ctx, id, req.body);
      if (!updated) throw new NotFoundError("Document not found");
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
