import type { Database } from "@siteops/db";
import {
  createChangeEventSchema,
  createChangeOrderSchema,
  createPotentialChangeOrderSchema,
  transitionChangeEventStatusSchema,
  updatePotentialChangeOrderStatusSchema,
} from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { generateChangeOrderListPdf } from "../lib/change-order-list-report";
import { generateChangeOrderPdf } from "../lib/change-order-report";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as changeManagementService from "../services/change-management.service";
import { toChangeOrderRegisterCsv } from "../services/export.service";
import { loadPermissionContext } from "../services/permission.service";
import { dispatchProjectEvent } from "../services/webhook.service";

export function changeEventsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createChangeEventSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await changeManagementService.createChangeEvent(appDb, authUser.id, ctx, req.body);
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
      const rows = await changeManagementService.listChangeEvents(appDb, authUser.id, ctx, projectId);
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
      if (!id) throw new NotFoundError("Change event not found");
      const event = await changeManagementService.findChangeEventById(appDb, authUser.id, id);
      if (!event) throw new NotFoundError("Change event not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, event.projectId);
      const detail = await changeManagementService.getChangeEvent(appDb, authUser.id, ctx, id);
      if (!detail) throw new NotFoundError("Change event not found");
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/transition", validateBody(transitionChangeEventStatusSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Change event not found");
      const event = await changeManagementService.findChangeEventById(appDb, authUser.id, id);
      if (!event) throw new NotFoundError("Change event not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, event.projectId);
      const updated = await changeManagementService.transitionChangeEventStatus(appDb, authUser.id, ctx, id, req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/potential-change-orders",
    validateBody(createPotentialChangeOrderSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Change event not found");
        const event = await changeManagementService.findChangeEventById(appDb, authUser.id, id);
        if (!event) throw new NotFoundError("Change event not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, event.projectId);
        const row = await changeManagementService.createPotentialChangeOrder(appDb, authUser.id, ctx, id, req.body);
        res.status(201).json(row);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

export function potentialChangeOrdersRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.patch(
    "/:id",
    validateBody(updatePotentialChangeOrderStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Potential change order not found");
        const pco = await changeManagementService.findPotentialChangeOrderById(appDb, authUser.id, id);
        if (!pco) throw new NotFoundError("Potential change order not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, pco.projectId);
        const updated = await changeManagementService.updatePotentialChangeOrderStatus(appDb, authUser.id, ctx, id, req.body);
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

export function changeOrdersRouter(appDb: Database, authDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createChangeOrderSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await changeManagementService.createChangeOrder(appDb, authUser.id, ctx, req.body);
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
      const rows = await changeManagementService.listChangeOrders(appDb, authUser.id, ctx, projectId);
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.get("/summary-report", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = req.query.projectId;
      if (typeof projectId !== "string") throw new NotFoundError("projectId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const reportData = await changeManagementService.getChangeOrderListReportData(appDb, authUser.id, ctx, projectId);
      if (req.query.format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="change-order-register.csv"`);
        res.send(toChangeOrderRegisterCsv(reportData));
        return;
      }
      const pdfBytes = await generateChangeOrderListPdf(reportData);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="change-order-register.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Change order not found");
      const co = await changeManagementService.findChangeOrderById(appDb, authUser.id, id);
      if (!co) throw new NotFoundError("Change order not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, co.projectId);
      const detail = await changeManagementService.getChangeOrder(appDb, authUser.id, ctx, id);
      if (!detail) throw new NotFoundError("Change order not found");
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/submit", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Change order not found");
      const co = await changeManagementService.findChangeOrderById(appDb, authUser.id, id);
      if (!co) throw new NotFoundError("Change order not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, co.projectId);
      const updated = await changeManagementService.submitChangeOrder(appDb, authUser.id, ctx, id);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/approve", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Change order not found");
      const co = await changeManagementService.findChangeOrderById(appDb, authUser.id, id);
      if (!co) throw new NotFoundError("Change order not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, co.projectId);
      const updated = await changeManagementService.approveChangeOrder(appDb, authUser.id, ctx, id);
      if (updated.status === "approved") {
        dispatchProjectEvent(authDb, co.projectId, "change_order.approved", {
          changeOrderId: updated.id,
          projectId: co.projectId,
          number: updated.number,
          costImpact: updated.costImpact,
        }).catch((err) => console.error("webhook dispatch failed for change_order.approved", err));
      }
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/execute", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Change order not found");
      const co = await changeManagementService.findChangeOrderById(appDb, authUser.id, id);
      if (!co) throw new NotFoundError("Change order not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, co.projectId);
      const updated = await changeManagementService.executeChangeOrder(appDb, authUser.id, ctx, id);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/reject", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Change order not found");
      const co = await changeManagementService.findChangeOrderById(appDb, authUser.id, id);
      if (!co) throw new NotFoundError("Change order not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, co.projectId);
      const updated = await changeManagementService.rejectChangeOrder(appDb, authUser.id, ctx, id);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/report", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Change order not found");
      const co = await changeManagementService.findChangeOrderById(appDb, authUser.id, id);
      if (!co) throw new NotFoundError("Change order not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, co.projectId);
      const reportData = await changeManagementService.getChangeOrderReportData(appDb, authUser.id, ctx, id);
      const pdfBytes = await generateChangeOrderPdf(reportData);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="change-order-${reportData.number}.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
