import type { Database } from "@siteops/db";
import { createChecklistTemplateSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import * as checklistTemplateService from "../services/checklist-template.service";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loadPermissionContext } from "../services/permission.service";

export function checklistTemplatesRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createChecklistTemplateSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const template = await checklistTemplateService.createChecklistTemplate(appDb, authUser.id, ctx, req.body);
      res.status(201).json(template);
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
      const templates = await checklistTemplateService.listChecklistTemplates(appDb, authUser.id, ctx, projectId);
      res.json(templates);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Checklist template not found");
      const template = await checklistTemplateService.getChecklistTemplate(appDb, authUser.id, id);
      if (!template) throw new NotFoundError("Checklist template not found");
      res.json(template);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
