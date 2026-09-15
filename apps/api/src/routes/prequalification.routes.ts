import type { Database } from "@siteops/db";
import { invitePrequalificationSchema, submitPrequalificationSchema, transitionPrequalificationStatusSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as prequalificationService from "../services/prequalification.service";
import { loadPermissionContext } from "../services/permission.service";

export function prequalificationRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  async function loadCtx(authUserId: string, id: string) {
    const row = await prequalificationService.findPrequalificationById(appDb, authUserId, id);
    if (!row) throw new NotFoundError("Prequalification not found");
    return { ctx: await loadPermissionContext(appDb, authUserId, row.projectId) };
  }

  router.post("/", validateBody(invitePrequalificationSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await prequalificationService.invitePrequalification(appDb, authUser.id, ctx, req.body);
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
      const rows = await prequalificationService.listPrequalifications(appDb, authUser.id, ctx, projectId);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/submit",
    validateBody(submitPrequalificationSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Prequalification not found");
        const { ctx } = await loadCtx(authUser.id, id);
        const updated = await prequalificationService.submitPrequalification(appDb, authUser.id, ctx, id, req.body);
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/:id/transition",
    validateBody(transitionPrequalificationStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Prequalification not found");
        const { ctx } = await loadCtx(authUser.id, id);
        const updated = await prequalificationService.transitionPrequalificationStatus(appDb, authUser.id, ctx, id, req.body);
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
