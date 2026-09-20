import type { Database } from "@siteops/db";
import {
  createSafetyIncidentSchema,
  createSafetyObservationSchema,
  listSafetyIncidentsQuerySchema,
  listSafetyObservationsQuerySchema,
  transitionSafetyIncidentStatusSchema,
} from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { ApiError, NotFoundError } from "../lib/errors";
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
      const listQuery = listSafetyIncidentsQuerySchema.parse({
        search: req.query.search,
        sort: req.query.sort,
        direction: req.query.direction,
        status: req.query.status,
        page: req.query.page,
        pageSize: req.query.pageSize,
      });
      const { rows, total } = await safetyService.listSafetyIncidents(appDb, authUser.id, ctx, projectId, listQuery);
      // Backward compatible: the body is always a plain array (see rfis.routes.ts's
      // GET / for the full rationale), `X-Total-Count` is purely additive.
      res.setHeader("X-Total-Count", String(total));
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

  router.get("/summary", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = req.query.projectId;
      if (typeof projectId !== "string") throw new NotFoundError("projectId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const summary = await safetyService.getSafetySummary(appDb, authUser.id, ctx, projectId);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  router.get("/osha-log", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = req.query.projectId;
      if (typeof projectId !== "string") throw new NotFoundError("projectId query param required");
      const yearRaw = req.query.year;
      const year = typeof yearRaw === "string" ? Number(yearRaw) : new Date().getUTCFullYear();
      if (!Number.isInteger(year)) throw new ApiError(400, "validation_error", "year must be an integer");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const rows = await safetyService.getOshaLog(appDb, authUser.id, ctx, projectId, year);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

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
      const listQuery = listSafetyObservationsQuerySchema.parse({
        search: req.query.search,
        sort: req.query.sort,
        direction: req.query.direction,
        category: req.query.category,
        status: req.query.status,
        page: req.query.page,
        pageSize: req.query.pageSize,
      });
      const { rows, total } = await safetyService.listSafetyObservations(appDb, authUser.id, ctx, projectId, listQuery);
      // Backward compatible: the body is always a plain array (see rfis.routes.ts's
      // GET / for the full rationale), `X-Total-Count` is purely additive.
      res.setHeader("X-Total-Count", String(total));
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
