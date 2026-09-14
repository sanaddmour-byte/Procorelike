import type { Database } from "@siteops/db";
import {
  clearPermissionOverrideSchema,
  deletePermissionTemplateSchema,
  permissionOverrideSchema,
  permissionTemplateSchema,
  updatePermissionTemplateSchema,
} from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as permissionService from "../services/permission.service";
import { loadPermissionContext } from "../services/permission.service";

/** Permission templates are global rows (packages/db schema.permissionTemplates has no project_id) -- every write still requires a projectId in the body purely to resolve which project's directory:admin gates the caller, per the comment on permissionTemplateSchema. */
export function permissionTemplatesRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = req.query.projectId;
      if (typeof projectId !== "string") throw new NotFoundError("projectId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const templates = await permissionService.listPermissionTemplates(appDb, authUser.id, ctx);
      res.json(templates);
    } catch (err) {
      next(err);
    }
  });

  router.post("/", validateBody(permissionTemplateSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const template = await permissionService.createPermissionTemplate(appDb, authUser.id, ctx, req.body);
      res.status(201).json(template);
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    "/:templateId",
    validateBody(updatePermissionTemplateSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const templateId = paramAsString(req.params.templateId);
        if (!templateId) throw new NotFoundError("Permission template not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
        const template = await permissionService.updatePermissionTemplate(appDb, authUser.id, ctx, templateId, req.body);
        res.json(template);
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    "/:templateId",
    validateBody(deletePermissionTemplateSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const templateId = paramAsString(req.params.templateId);
        if (!templateId) throw new NotFoundError("Permission template not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
        await permissionService.deletePermissionTemplate(appDb, authUser.id, ctx, templateId);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

export function permissionOverridesRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.put("/", validateBody(permissionOverrideSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      await permissionService.setPermissionOverride(
        appDb,
        authUser.id,
        ctx,
        req.body.projectId,
        req.body.userId,
        req.body.module,
        req.body.level,
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.delete("/", validateBody(clearPermissionOverrideSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      await permissionService.clearPermissionOverride(appDb, authUser.id, ctx, req.body.projectId, req.body.userId, req.body.module);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
