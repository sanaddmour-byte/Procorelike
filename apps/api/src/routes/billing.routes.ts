import type { Database } from "@siteops/db";
import {
  createPaymentApplicationSchema,
  listPaymentApplicationsQuerySchema,
  setPaymentApplicationLinesSchema,
  transitionPaymentApplicationStatusSchema,
} from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as billingService from "../services/billing.service";
import { loadPermissionContext } from "../services/permission.service";

export function billingRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createPaymentApplicationSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await billingService.createPaymentApplication(appDb, authUser.id, ctx, req.body);
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
      const listQuery = listPaymentApplicationsQuerySchema.parse({
        search: req.query.search,
        sort: req.query.sort,
        direction: req.query.direction,
        status: req.query.status,
        page: req.query.page,
        pageSize: req.query.pageSize,
      });
      const { rows, total } = await billingService.listPaymentApplications(appDb, authUser.id, ctx, projectId, listQuery);
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
      if (!id) throw new NotFoundError("Payment application not found");
      const application = await billingService.findPaymentApplicationById(appDb, authUser.id, id);
      if (!application) throw new NotFoundError("Payment application not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, application.projectId);
      const detail = await billingService.getPaymentApplication(appDb, authUser.id, ctx, id);
      if (!detail) throw new NotFoundError("Payment application not found");
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.put(
    "/:id/lines",
    validateBody(setPaymentApplicationLinesSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Payment application not found");
        const application = await billingService.findPaymentApplicationById(appDb, authUser.id, id);
        if (!application) throw new NotFoundError("Payment application not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, application.projectId);
        const rows = await billingService.setPaymentApplicationLines(appDb, authUser.id, ctx, id, req.body);
        res.json(rows);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/:id/transition",
    validateBody(transitionPaymentApplicationStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Payment application not found");
        const application = await billingService.findPaymentApplicationById(appDb, authUser.id, id);
        if (!application) throw new NotFoundError("Payment application not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, application.projectId);
        const updated = await billingService.transitionPaymentApplicationStatus(appDb, authUser.id, ctx, id, req.body);
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
