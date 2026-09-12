import type { Database } from "@siteops/db";
import { createPhotoAlbumSchema, createPhotoSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loadPermissionContext } from "../services/permission.service";
import * as photoService from "../services/photo.service";

export function photosRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/albums", validateBody(createPhotoAlbumSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const album = await photoService.createPhotoAlbum(appDb, authUser.id, ctx, req.body);
      res.status(201).json(album);
    } catch (err) {
      next(err);
    }
  });

  router.get("/albums", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = req.query.projectId;
      if (typeof projectId !== "string") throw new NotFoundError("projectId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const albums = await photoService.listPhotoAlbums(appDb, authUser.id, ctx, projectId);
      res.json(albums);
    } catch (err) {
      next(err);
    }
  });

  router.post("/", validateBody(createPhotoSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const photo = await photoService.createPhoto(appDb, authUser.id, ctx, req.body);
      res.status(201).json(photo);
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
      const photos = await photoService.listPhotos(appDb, authUser.id, ctx, projectId);
      res.json(photos);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
