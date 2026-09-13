import type { Database } from "@siteops/db";
import {
  createSafetyIncidentSchema,
  createSafetyObservationSchema,
  transitionSafetyIncidentStatusSchema,
} from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loadPermissionContext } from "../services/permission.service";
import * as safetyService from "../services/safety.service";

export function safetyIncidentsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createSafetyIncidentSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await safetyService.createSafetyIncident(appDb, authUser.id, ctx, req.body);
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
      const rows = await safetyService.listSafetyIncidents(appDb, authUser.id, ctx, projectId);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/transition",
    validateBody(transitionSafetyIncidentStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Safety incident not found");
        const incident = await safetyService.findSafetyIncidentById(appDb, authUser.id, id);
        if (!incident) throw new NotFoundError("Safety incident not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, incident.projectId);
        const updated = await safetyService.transitionSafetyIncidentStatus(appDb, authUser.id, ctx, id, req.body);
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

export function safetyObservationsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createSafetyObservationSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await safetyService.createSafetyObservation(appDb, authUser.id, ctx, req.body);
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
      const rows = await safetyService.listSafetyObservations(appDb, authUser.id, ctx, projectId);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/toggle-resolved", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Safety observation not found");
      const observation = await safetyService.findSafetyObservationById(appDb, authUser.id, id);
      if (!observation) throw new NotFoundError("Safety observation not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, observation.projectId);
      const updated = await safetyService.resolveSafetyObservation(appDb, authUser.id, ctx, id);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
