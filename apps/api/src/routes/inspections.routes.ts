import type { Database } from "@siteops/db";
import {
  completeInspectionSchema,
  createInspectionSchema,
  transitionInspectionStatusSchema,
  updateInspectionResponsesSchema,
} from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { generateInspectionListPdf } from "../lib/inspection-list-report";
import { generateInspectionReportPdf } from "../lib/inspection-report";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { toInspectionRegisterCsv } from "../services/export.service";
import * as inspectionService from "../services/inspection.service";
import { loadPermissionContext } from "../services/permission.service";

export function inspectionsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createInspectionSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const inspection = await inspectionService.createInspection(appDb, authUser.id, ctx, req.body);
      res.status(201).json(inspection);
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
      const inspections = await inspectionService.listInspections(appDb, authUser.id, ctx, projectId);
      res.json(inspections);
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
      const reportData = await inspectionService.getInspectionListReportData(appDb, authUser.id, ctx, projectId);
      if (req.query.format === "csv") {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="inspection-register.csv"`);
        res.send(toInspectionRegisterCsv(reportData));
        return;
      }
      const pdfBytes = await generateInspectionListPdf(reportData);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="inspection-register.pdf"`);
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
      if (!id) throw new NotFoundError("Inspection not found");
      const inspection = await inspectionService.findInspectionById(appDb, authUser.id, id);
      if (!inspection) throw new NotFoundError("Inspection not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, inspection.projectId);
      const detail = await inspectionService.getInspection(appDb, authUser.id, ctx, id);
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    "/:id/responses",
    validateBody(updateInspectionResponsesSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Inspection not found");
        const inspection = await inspectionService.findInspectionById(appDb, authUser.id, id);
        if (!inspection) throw new NotFoundError("Inspection not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, inspection.projectId);
        const responses = await inspectionService.updateInspectionResponses(appDb, authUser.id, ctx, id, req.body);
        res.json(responses);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/:id/transition",
    validateBody(transitionInspectionStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Inspection not found");
        const inspection = await inspectionService.findInspectionById(appDb, authUser.id, id);
        if (!inspection) throw new NotFoundError("Inspection not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, inspection.projectId);
        const updated = await inspectionService.transitionInspectionStatus(appDb, authUser.id, ctx, id, req.body);
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post("/:id/complete", validateBody(completeInspectionSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Inspection not found");
      const inspection = await inspectionService.findInspectionById(appDb, authUser.id, id);
      if (!inspection) throw new NotFoundError("Inspection not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, inspection.projectId);
      const completed = await inspectionService.completeInspection(appDb, authUser.id, ctx, id, req.body);
      res.json(completed);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/signature", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Inspection not found");
      const inspection = await inspectionService.findInspectionById(appDb, authUser.id, id);
      if (!inspection) throw new NotFoundError("Inspection not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, inspection.projectId);
      const verification = await inspectionService.getInspectionSignature(appDb, authUser.id, ctx, id);
      res.json(verification);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/report", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Inspection not found");
      const inspection = await inspectionService.findInspectionById(appDb, authUser.id, id);
      if (!inspection) throw new NotFoundError("Inspection not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, inspection.projectId);
      const reportData = await inspectionService.getInspectionReportData(appDb, authUser.id, ctx, id);
      const pdfBytes = await generateInspectionReportPdf(reportData);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="inspection-${id}.pdf"`);
      res.send(Buffer.from(pdfBytes));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
