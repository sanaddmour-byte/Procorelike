import { assignPermissionTemplateSchema, createProjectSchema, updateProjectSettingsSchema } from "@siteops/shared";
import { Router, type Request, type Response, type NextFunction } from "express";
import type { Database } from "@siteops/db";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as projectService from "../services/project.service";
import * as permissionService from "../services/permission.service";
import { listDirectoryCompanies, listProjectCompanies, listProjectCostCodes, listProjectMembers } from "../services/directory.service";
import { getProjectDashboard } from "../services/dashboard.service";
import { getProjectAnalytics } from "../services/analytics.service";
import { loadPermissionContext } from "../services/permission.service";
import { getEntityHistory, isHistoryEntityType } from "../services/entity-history.service";

export function projectsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post(
    "/",
    validateBody(createProjectSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const project = await projectService.createProject(appDb, authUser.id, req.body);
        res.status(201).json(project);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectList = await projectService.listMyProjects(appDb, authUser.id);
      res.json(projectList);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = paramAsString(req.params.id);
      if (!projectId) throw new Error("missing :id param");
      const project = await permissionService.findProjectById(appDb, authUser.id, projectId);
      if (!project) throw new NotFoundError("Project not found");
      res.json(project);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/members", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = paramAsString(req.params.id);
      if (!projectId) throw new Error("missing :id param");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const members = await listProjectMembers(appDb, authUser.id, ctx, projectId);
      res.json(members);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/cost-codes", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = paramAsString(req.params.id);
      if (!projectId) throw new Error("missing :id param");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const costCodes = await listProjectCostCodes(appDb, authUser.id, ctx, projectId);
      res.json(costCodes);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/directory-companies", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = paramAsString(req.params.id);
      if (!projectId) throw new Error("missing :id param");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const companies = await listDirectoryCompanies(appDb, authUser.id, ctx, projectId);
      res.json(companies);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/dashboard", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = paramAsString(req.params.id);
      if (!projectId) throw new Error("missing :id param");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const dashboard = await getProjectDashboard(appDb, authUser.id, ctx, projectId);
      res.json(dashboard);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/analytics", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = paramAsString(req.params.id);
      if (!projectId) throw new Error("missing :id param");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const analytics = await getProjectAnalytics(appDb, authUser.id, ctx, projectId);
      res.json(analytics);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/companies", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = paramAsString(req.params.id);
      if (!projectId) throw new Error("missing :id param");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const companies = await listProjectCompanies(appDb, authUser.id, ctx, projectId);
      res.json(companies);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/member-permissions", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = paramAsString(req.params.id);
      if (!projectId) throw new Error("missing :id param");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const members = await permissionService.listMemberPermissions(appDb, authUser.id, ctx, projectId);
      res.json(members);
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    "/:id/members/:userId/permission-template",
    validateBody(assignPermissionTemplateSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const projectId = paramAsString(req.params.id);
        const targetUserId = paramAsString(req.params.userId);
        if (!projectId || !targetUserId) throw new Error("missing :id/:userId param");
        const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
        await permissionService.assignPermissionTemplate(appDb, authUser.id, ctx, projectId, targetUserId, req.body);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    "/:id/settings",
    validateBody(updateProjectSettingsSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const projectId = paramAsString(req.params.id);
        if (!projectId) throw new Error("missing :id param");
        const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
        const project = await projectService.updateProjectSettings(appDb, authUser.id, ctx, projectId, req.body);
        res.json(project);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get("/:id/history", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = paramAsString(req.params.id);
      if (!projectId) throw new Error("missing :id param");
      const entityType = typeof req.query.entityType === "string" ? req.query.entityType : undefined;
      const entityId = typeof req.query.entityId === "string" ? req.query.entityId : undefined;
      if (!entityType || !entityId || !isHistoryEntityType(entityType)) {
        throw new NotFoundError("entityType and entityId query params required");
      }
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const history = await getEntityHistory(appDb, authUser.id, ctx, projectId, entityType, entityId);
      res.json(history);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
