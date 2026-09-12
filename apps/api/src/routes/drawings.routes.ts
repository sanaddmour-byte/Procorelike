import type { Database } from "@siteops/db";
import { createDrawingRevisionSchema, createDrawingSchema, createMarkupSchema, updateDrawingSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as drawingService from "../services/drawing.service";
import { loadPermissionContext } from "../services/permission.service";

export function drawingsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createDrawingSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const drawing = await drawingService.createDrawing(appDb, authUser.id, ctx, req.body);
      res.status(201).json(drawing);
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
      const drawings = await drawingService.listDrawings(appDb, authUser.id, ctx, projectId);
      res.json(drawings);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Drawing not found");
      const drawing = await drawingService.findDrawingById(appDb, authUser.id, id);
      if (!drawing) throw new NotFoundError("Drawing not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, drawing.projectId);
      const detail = await drawingService.getDrawing(appDb, authUser.id, ctx, id);
      if (!detail) throw new NotFoundError("Drawing not found");
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", validateBody(updateDrawingSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Drawing not found");
      const drawing = await drawingService.findDrawingById(appDb, authUser.id, id);
      if (!drawing) throw new NotFoundError("Drawing not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, drawing.projectId);
      const updated = await drawingService.updateDrawing(appDb, authUser.id, ctx, id, req.body);
      if (!updated) throw new NotFoundError("Drawing not found");
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/revisions",
    validateBody(createDrawingRevisionSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Drawing not found");
        const drawing = await drawingService.findDrawingById(appDb, authUser.id, id);
        if (!drawing) throw new NotFoundError("Drawing not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, drawing.projectId);
        const revision = await drawingService.createDrawingRevision(appDb, authUser.id, ctx, id, req.body);
        res.status(201).json(revision);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get("/:id/revisions", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Drawing not found");
      const drawing = await drawingService.findDrawingById(appDb, authUser.id, id);
      if (!drawing) throw new NotFoundError("Drawing not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, drawing.projectId);
      const revisions = await drawingService.listDrawingRevisions(appDb, authUser.id, ctx, id);
      res.json(revisions);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/revisions/:revisionId/markups",
    validateBody(createMarkupSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const revisionId = paramAsString(req.params.revisionId);
        if (!revisionId) throw new NotFoundError("Drawing revision not found");
        const revision = await drawingService.findDrawingRevisionById(appDb, authUser.id, revisionId);
        if (!revision) throw new NotFoundError("Drawing revision not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, revision.projectId);
        const markup = await drawingService.createMarkup(appDb, authUser.id, ctx, revisionId, req.body);
        res.status(201).json(markup);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get("/revisions/:revisionId/markups", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const revisionId = paramAsString(req.params.revisionId);
      if (!revisionId) throw new NotFoundError("Drawing revision not found");
      const revision = await drawingService.findDrawingRevisionById(appDb, authUser.id, revisionId);
      if (!revision) throw new NotFoundError("Drawing revision not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, revision.projectId);
      const markups = await drawingService.listMarkups(appDb, authUser.id, ctx, revisionId);
      res.json(markups);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
