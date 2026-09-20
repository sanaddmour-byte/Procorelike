import type { Database } from "@siteops/db";
import {
  awardBidSchema,
  createBidPackageSchema,
  inviteBidderSchema,
  listBidPackagesQuerySchema,
  logBidSchema,
  transitionBidPackageStatusSchema,
} from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as biddingService from "../services/bidding.service";
import { loadPermissionContext } from "../services/permission.service";

export function bidPackagesRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  async function loadCtx(authUserId: string, id: string) {
    const row = await biddingService.findBidPackageById(appDb, authUserId, id);
    if (!row) throw new NotFoundError("Bid package not found");
    return { ctx: await loadPermissionContext(appDb, authUserId, row.projectId), bidPackage: row };
  }

  router.post("/", validateBody(createBidPackageSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await biddingService.createBidPackage(appDb, authUser.id, ctx, req.body);
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
      const listQuery = listBidPackagesQuerySchema.parse({
        search: req.query.search,
        sort: req.query.sort,
        direction: req.query.direction,
        status: req.query.status,
        page: req.query.page,
        pageSize: req.query.pageSize,
      });
      const { rows, total } = await biddingService.listBidPackages(appDb, authUser.id, ctx, projectId, listQuery);
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
      if (!id) throw new NotFoundError("Bid package not found");
      const { ctx } = await loadCtx(authUser.id, id);
      const detail = await biddingService.getBidPackage(appDb, authUser.id, ctx, id);
      if (!detail) throw new NotFoundError("Bid package not found");
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/transition",
    validateBody(transitionBidPackageStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Bid package not found");
        const { ctx } = await loadCtx(authUser.id, id);
        const updated = await biddingService.transitionBidPackageStatus(appDb, authUser.id, ctx, id, req.body);
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post("/:id/invite", validateBody(inviteBidderSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Bid package not found");
      const { ctx } = await loadCtx(authUser.id, id);
      const row = await biddingService.inviteBidder(appDb, authUser.id, ctx, id, req.body);
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/bids", validateBody(logBidSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Bid package not found");
      const { ctx } = await loadCtx(authUser.id, id);
      const row = await biddingService.logBid(appDb, authUser.id, ctx, id, req.body);
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function bidsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/:id/award", validateBody(awardBidSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Bid not found");

      const found = await biddingService.findBidWithPackage(appDb, authUser.id, id);
      if (!found) throw new NotFoundError("Bid not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, found.bidPackage.projectId);
      const result = await biddingService.awardBid(appDb, authUser.id, ctx, id, req.body);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
