import type { Database } from "@siteops/db";
import { createEstimateLineItemSchema, createEstimateSchema, listEstimatesQuerySchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as estimatingService from "../services/estimating.service";
import { loadPermissionContext } from "../services/permission.service";

export function estimatesRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  async function loadCtx(authUserId: string, id: string) {
    const row = await estimatingService.findEstimateById(appDb, authUserId, id);
    if (!row) throw new NotFoundError("Estimate not found");
    return { ctx: await loadPermissionContext(appDb, authUserId, row.projectId) };
  }

  router.post("/", validateBody(createEstimateSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await estimatingService.createEstimate(appDb, authUser.id, ctx, req.body);
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
      const listQuery = listEstimatesQuerySchema.parse({
        search: req.query.search,
        sort: req.query.sort,
        direction: req.query.direction,
        status: req.query.status,
        page: req.query.page,
        pageSize: req.query.pageSize,
      });
      const { rows, total } = await estimatingService.listEstimates(appDb, authUser.id, ctx, projectId, listQuery);
      // Backward compatible: the body is always a plain array (see rfis.routes.ts's
      // GET / for the full rationale), `X-Total-Count` is purely additive.
      res.setHeader("X-Total-Count", String(total));
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Estimate not found");
      const { ctx } = await loadCtx(authUser.id, id);
      const detail = await estimatingService.getEstimate(appDb, authUser.id, ctx, id);
      if (!detail) throw new NotFoundError("Estimate not found");
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/line-items",
    validateBody(createEstimateLineItemSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Estimate not found");
        const { ctx } = await loadCtx(authUser.id, id);
        const row = await estimatingService.addEstimateLineItem(appDb, authUser.id, ctx, id, req.body);
        res.status(201).json(row);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post("/:id/finalize", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Estimate not found");
      const { ctx } = await loadCtx(authUser.id, id);
      const updated = await estimatingService.finalizeEstimate(appDb, authUser.id, ctx, id);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/convert-to-budget", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Estimate not found");
      const { ctx } = await loadCtx(authUser.id, id);
      const rows = await estimatingService.convertEstimateToBudget(appDb, authUser.id, ctx, id);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
