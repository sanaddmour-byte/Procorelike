import type { Database } from "@siteops/db";
import { createDrawingSetSchema, createTransmittalSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as documentControlService from "../services/document-control.service";
import { loadPermissionContext } from "../services/permission.service";

export function transmittalsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  async function loadCtx(authUserId: string, id: string) {
    const row = await documentControlService.findTransmittalById(appDb, authUserId, id);
    if (!row) throw new NotFoundError("Transmittal not found");
    return { ctx: await loadPermissionContext(appDb, authUserId, row.projectId) };
  }

  router.post("/", validateBody(createTransmittalSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await documentControlService.createTransmittal(appDb, authUser.id, ctx, req.body);
      res.status(201).json(row);
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
      const rows = await documentControlService.listTransmittals(appDb, authUser.id, ctx, projectId);
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
      if (!id) throw new NotFoundError("Transmittal not found");
      const { ctx } = await loadCtx(authUser.id, id);
      const row = await documentControlService.getTransmittal(appDb, authUser.id, ctx, id);
      res.json(row);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/send", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Transmittal not found");
      const { ctx } = await loadCtx(authUser.id, id);
      const row = await documentControlService.sendTransmittal(appDb, authUser.id, ctx, id);
      res.json(row);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/acknowledge", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Transmittal not found");
      const { ctx } = await loadCtx(authUser.id, id);
      const row = await documentControlService.acknowledgeTransmittal(appDb, authUser.id, ctx, id);
      res.json(row);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function drawingSetsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  async function loadCtx(authUserId: string, id: string) {
    const row = await documentControlService.findDrawingSetById(appDb, authUserId, id);
    if (!row) throw new NotFoundError("Drawing set not found");
    return { ctx: await loadPermissionContext(appDb, authUserId, row.projectId) };
  }

  router.post("/", validateBody(createDrawingSetSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await documentControlService.createDrawingSet(appDb, authUser.id, ctx, req.body);
      res.status(201).json(row);
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
      const rows = await documentControlService.listDrawingSets(appDb, authUser.id, ctx, projectId);
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
      if (!id) throw new NotFoundError("Drawing set not found");
      const { ctx } = await loadCtx(authUser.id, id);
      const row = await documentControlService.getDrawingSet(appDb, authUser.id, ctx, id);
      res.json(row);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
