import type { Database } from "@siteops/db";
import { createCustomFieldDefinitionSchema, isModule, setCustomFieldValueSchema, updateCustomFieldDefinitionSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import * as customFieldService from "../services/custom-field.service";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loadPermissionContext } from "../services/permission.service";

export function customFieldDefinitionsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      const moduleParam = typeof req.query.module === "string" ? req.query.module : undefined;
      if (!projectId || !moduleParam || !isModule(moduleParam)) throw new NotFoundError("projectId and module query params required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const definitions = await customFieldService.listCustomFieldDefinitions(appDb, authUser.id, ctx, projectId, moduleParam);
      res.json(definitions);
    } catch (err) {
      next(err);
    }
  });

  router.post("/", validateBody(createCustomFieldDefinitionSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const definition = await customFieldService.createCustomFieldDefinition(appDb, authUser.id, ctx, req.body);
      res.status(201).json(definition);
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    "/:definitionId",
    validateBody(updateCustomFieldDefinitionSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const definitionId = paramAsString(req.params.definitionId);
        if (!definitionId) throw new NotFoundError("Custom field definition not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
        const definition = await customFieldService.updateCustomFieldDefinition(appDb, authUser.id, ctx, definitionId, req.body);
        res.json(definition);
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete("/:definitionId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const definitionId = paramAsString(req.params.definitionId);
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      if (!definitionId) throw new NotFoundError("Custom field definition not found");
      if (!projectId) throw new NotFoundError("projectId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      await customFieldService.deleteCustomFieldDefinition(appDb, authUser.id, ctx, definitionId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function customFieldValuesRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
      const moduleParam = typeof req.query.module === "string" ? req.query.module : undefined;
      const entityId = typeof req.query.entityId === "string" ? req.query.entityId : undefined;
      if (!projectId || !moduleParam || !isModule(moduleParam) || !entityId) {
        throw new NotFoundError("projectId, module, and entityId query params required");
      }
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const values = await customFieldService.listCustomFieldValuesForEntity(appDb, authUser.id, ctx, projectId, moduleParam, entityId);
      res.json(values);
    } catch (err) {
      next(err);
    }
  });

  router.put(
    "/:definitionId/:entityId",
    validateBody(setCustomFieldValueSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const definitionId = paramAsString(req.params.definitionId);
        const entityId = paramAsString(req.params.entityId);
        const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
        if (!definitionId || !entityId) throw new NotFoundError("Custom field definition not found");
        if (!projectId) throw new NotFoundError("projectId query param required");
        const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
        const value = await customFieldService.setCustomFieldValue(appDb, authUser.id, ctx, definitionId, entityId, req.body.value);
        res.json(value);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
