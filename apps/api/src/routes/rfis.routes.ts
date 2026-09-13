import type { Database } from "@siteops/db";
import { createRfiResponseSchema, createRfiSchema, transitionRfiStatusSchema, updateRfiSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { generateRfiListPdf } from "../lib/rfi-list-report";
import { generateRfiPdf } from "../lib/rfi-report";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loadPermissionContext } from "../services/permission.service";
import * as rfiService from "../services/rfi.service";

export function rfisRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createRfiSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const rfi = await rfiService.createRfi(appDb, authUser.id, ctx, req.body);
      res.status(201).json(rfi);
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
      const rfis = await rfiService.listRfis(appDb, authUser.id, ctx, projectId);
      res.json(rfis);
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
      const reportData = await rfiService.getRfiListReportData(appDb, authUser.id, ctx, projectId);
      const pdfBytes = await generateRfiListPdf(reportData);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="rfi-register.pdf"`);
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
      if (!id) throw new NotFoundError("RFI not found");
      const rfi = await rfiService.findRfiById(appDb, authUser.id, id);
      if (!rfi) throw new NotFoundError("RFI not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, rfi.projectId);
      const detail = await rfiService.getRfi(appDb, authUser.id, ctx, id);
      if (!detail) throw new NotFoundError("RFI not found");
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", validateBody(updateRfiSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("RFI not found");
      const rfi = await rfiService.findRfiById(appDb, authUser.id, id);
      if (!rfi) throw new NotFoundError("RFI not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, rfi.projectId);
      const updated = await rfiService.updateRfi(appDb, authUser.id, ctx, id, req.body);
      if (!updated) throw new NotFoundError("RFI not found");
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/responses",
    validateBody(createRfiResponseSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("RFI not found");
        const rfi = await rfiService.findRfiById(appDb, authUser.id, id);
        if (!rfi) throw new NotFoundError("RFI not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, rfi.projectId);
        const response = await rfiService.addRfiResponse(appDb, authUser.id, ctx, id, req.body);
        res.status(201).json(response);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/:id/transition",
    validateBody(transitionRfiStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("RFI not found");
        const rfi = await rfiService.findRfiById(appDb, authUser.id, id);
        if (!rfi) throw new NotFoundError("RFI not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, rfi.projectId);
        const updated = await rfiService.transitionRfiStatus(appDb, authUser.id, ctx, id, req.body);
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get("/:id/report", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("RFI not found");
      const rfi = await rfiService.findRfiById(appDb, authUser.id, id);
      if (!rfi) throw new NotFoundError("RFI not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, rfi.projectId);
      const reportData = await rfiService.getRfiReportData(appDb, authUser.id, ctx, id);
      const pdfBytes = await generateRfiPdf(reportData);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="rfi-${reportData.number}.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
