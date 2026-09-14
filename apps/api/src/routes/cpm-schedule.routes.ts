import type { Database } from "@siteops/db";
import { importScheduleSchema, scheduleEditBatchSchema, setNativeEditingEnabledSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as cpmScheduleService from "../services/cpm-schedule.service";
import * as cpmScheduleEditService from "../services/cpm-schedule-edit.service";
import { loadPermissionContext } from "../services/permission.service";

export function cpmScheduleRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/import", validateBody(importScheduleSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const result = await cpmScheduleService.importSchedule(appDb, authUser.id, ctx, req.body);
      res.status(201).json(result);
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
      const result = await cpmScheduleService.getScheduleForProject(appDb, authUser.id, ctx, projectId);
      if (!result) throw new NotFoundError("No schedule found for this project");
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get("/current", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = req.query.projectId;
      if (typeof projectId !== "string") throw new NotFoundError("projectId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const result = await cpmScheduleService.getCurrentScheduleWithTasks(appDb, authUser.id, ctx, projectId);
      if (!result) throw new NotFoundError("No schedule found for this project");
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get("/versions/:versionId/tasks", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const versionId = paramAsString(req.params.versionId);
      if (!versionId) throw new NotFoundError("Schedule version not found");
      const projectId = await cpmScheduleService.findVersionProjectId(appDb, authUser.id, versionId);
      if (!projectId) throw new NotFoundError("Schedule version not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const result = await cpmScheduleService.listVersionTasks(appDb, authUser.id, ctx, versionId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // -- Phase 11d / Tier B: feature-flagged native CPM editing --

  router.patch("/:scheduleId/native-editing", validateBody(setNativeEditingEnabledSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const scheduleId = paramAsString(req.params.scheduleId);
      if (!scheduleId) throw new NotFoundError("Schedule not found");
      const projectId = await cpmScheduleService.findScheduleProjectId(appDb, authUser.id, scheduleId);
      if (!projectId) throw new NotFoundError("Schedule not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const result = await cpmScheduleEditService.setNativeEditingEnabled(appDb, authUser.id, ctx, scheduleId, req.body.enabled);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/versions/:versionId/preview", validateBody(scheduleEditBatchSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const versionId = paramAsString(req.params.versionId);
      if (!versionId) throw new NotFoundError("Schedule version not found");
      const projectId = await cpmScheduleService.findVersionProjectId(appDb, authUser.id, versionId);
      if (!projectId) throw new NotFoundError("Schedule version not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const result = await cpmScheduleEditService.previewScheduleEdits(appDb, authUser.id, ctx, versionId, req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/versions/:versionId/apply", validateBody(scheduleEditBatchSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const versionId = paramAsString(req.params.versionId);
      if (!versionId) throw new NotFoundError("Schedule version not found");
      const projectId = await cpmScheduleService.findVersionProjectId(appDb, authUser.id, versionId);
      if (!projectId) throw new NotFoundError("Schedule version not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const result = await cpmScheduleEditService.applyScheduleEdits(appDb, authUser.id, ctx, versionId, req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/versions/:versionId/recompute", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const versionId = paramAsString(req.params.versionId);
      if (!versionId) throw new NotFoundError("Schedule version not found");
      const projectId = await cpmScheduleService.findVersionProjectId(appDb, authUser.id, versionId);
      if (!projectId) throw new NotFoundError("Schedule version not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const result = await cpmScheduleEditService.recomputeVersion(appDb, authUser.id, ctx, versionId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get("/versions/:versionId/export.xml", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const versionId = paramAsString(req.params.versionId);
      if (!versionId) throw new NotFoundError("Schedule version not found");
      const projectId = await cpmScheduleService.findVersionProjectId(appDb, authUser.id, versionId);
      if (!projectId) throw new NotFoundError("Schedule version not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const xml = await cpmScheduleEditService.exportVersionXml(appDb, authUser.id, ctx, versionId);
      res.setHeader("Content-Type", "application/xml");
      res.setHeader("Content-Disposition", `attachment; filename="schedule-${versionId}.xml"`);
      res.send(xml);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
