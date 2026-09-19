import type { Database } from "@siteops/db";
import {
  createActionPlanTemplateItemSchema,
  createActionPlanTemplateSchema,
  updateActionPlanTemplateItemSchema,
  updateActionPlanTemplateSchema,
} from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import * as templateService from "../services/action-plan-template.service";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loadPermissionContext } from "../services/permission.service";

export function actionPlanTemplatesRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      if (!projectId) throw new NotFoundError("projectId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const templates = await templateService.listActionPlanTemplates(appDb, authUser.id, ctx, projectId);
      res.json(templates);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const templateId = paramAsString(req.params.id);
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      if (!templateId) throw new NotFoundError("Action plan template not found");
      if (!projectId) throw new NotFoundError("projectId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const template = await templateService.getActionPlanTemplate(appDb, authUser.id, ctx, templateId);
      res.json(template);
    } catch (err) {
      next(err);
    }
  });

  router.post("/", validateBody(createActionPlanTemplateSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const template = await templateService.createActionPlanTemplate(appDb, authUser.id, ctx, req.body);
      res.status(201).json(template);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", validateBody(updateActionPlanTemplateSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const templateId = paramAsString(req.params.id);
      if (!templateId) throw new NotFoundError("Action plan template not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const template = await templateService.updateActionPlanTemplate(appDb, authUser.id, ctx, templateId, req.body);
      res.json(template);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const templateId = paramAsString(req.params.id);
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      if (!templateId) throw new NotFoundError("Action plan template not found");
      if (!projectId) throw new NotFoundError("projectId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      await templateService.deleteActionPlanTemplate(appDb, authUser.id, ctx, templateId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/items", validateBody(createActionPlanTemplateItemSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const templateId = paramAsString(req.params.id);
      if (!templateId) throw new NotFoundError("Action plan template not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const item = await templateService.createActionPlanTemplateItem(appDb, authUser.id, ctx, templateId, req.body);
      res.status(201).json(item);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/items/:itemId", validateBody(updateActionPlanTemplateItemSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const itemId = paramAsString(req.params.itemId);
      if (!itemId) throw new NotFoundError("Action plan template item not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const item = await templateService.updateActionPlanTemplateItem(appDb, authUser.id, ctx, itemId, req.body);
      res.json(item);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/items/:itemId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const itemId = paramAsString(req.params.itemId);
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      if (!itemId) throw new NotFoundError("Action plan template item not found");
      if (!projectId) throw new NotFoundError("projectId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      await templateService.deleteActionPlanTemplateItem(appDb, authUser.id, ctx, itemId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
