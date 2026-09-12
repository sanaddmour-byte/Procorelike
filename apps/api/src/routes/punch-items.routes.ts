import type { Database } from "@siteops/db";
import { createPunchItemSchema, transitionPunchItemStatusSchema, updatePunchItemSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loadPermissionContext } from "../services/permission.service";
import * as punchItemService from "../services/punch-item.service";

export function punchItemsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createPunchItemSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const item = await punchItemService.createPunchItem(appDb, authUser.id, ctx, req.body);
      res.status(201).json(item);
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
      const items = await punchItemService.listPunchItems(appDb, authUser.id, ctx, projectId);
      res.json(items);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Punch item not found");
      const item = await punchItemService.findPunchItemById(appDb, authUser.id, id);
      if (!item) throw new NotFoundError("Punch item not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, item.projectId);
      const detail = await punchItemService.getPunchItem(appDb, authUser.id, ctx, id);
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", validateBody(updatePunchItemSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Punch item not found");
      const item = await punchItemService.findPunchItemById(appDb, authUser.id, id);
      if (!item) throw new NotFoundError("Punch item not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, item.projectId);
      const updated = await punchItemService.updatePunchItem(appDb, authUser.id, ctx, id, req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/transition",
    validateBody(transitionPunchItemStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Punch item not found");
        const item = await punchItemService.findPunchItemById(appDb, authUser.id, id);
        if (!item) throw new NotFoundError("Punch item not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, item.projectId);
        const updated = await punchItemService.transitionPunchItemStatus(appDb, authUser.id, ctx, id, req.body);
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
