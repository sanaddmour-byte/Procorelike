import { createProjectSchema } from "@siteops/shared";
import { Router, type Request, type Response, type NextFunction } from "express";
import type { Database } from "@siteops/db";
import type { Env } from "../env";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as projectService from "../services/project.service";
import { listProjectCompanies, listProjectCostCodes, listProjectMembers } from "../services/directory.service";
import { loadPermissionContext } from "../services/permission.service";

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

  return router;
}
