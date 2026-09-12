import type { Database } from "@siteops/db";
import { createSubmittalRevisionSchema, createSubmittalSchema, submitSubmittalReviewSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loadPermissionContext } from "../services/permission.service";
import * as submittalService from "../services/submittal.service";

export function submittalsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get("/spec-sections", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = req.query.projectId;
      if (typeof projectId !== "string") throw new NotFoundError("projectId query param required");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const sections = await submittalService.listSpecSections(appDb, authUser.id, ctx, projectId);
      res.json(sections);
    } catch (err) {
      next(err);
    }
  });

  router.post("/", validateBody(createSubmittalSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const submittal = await submittalService.createSubmittal(appDb, authUser.id, ctx, req.body);
      res.status(201).json(submittal);
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
      const submittals = await submittalService.listSubmittals(appDb, authUser.id, ctx, projectId);
      res.json(submittals);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Submittal not found");
      const submittal = await submittalService.findSubmittalById(appDb, authUser.id, id);
      if (!submittal) throw new NotFoundError("Submittal not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, submittal.projectId);
      const detail = await submittalService.getSubmittal(appDb, authUser.id, ctx, id);
      if (!detail) throw new NotFoundError("Submittal not found");
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/packages", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Submittal not found");
      const submittal = await submittalService.findSubmittalById(appDb, authUser.id, id);
      if (!submittal) throw new NotFoundError("Submittal not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, submittal.projectId);
      const pkg = await submittalService.createSubmittalPackage(appDb, authUser.id, ctx, id);
      res.status(201).json(pkg);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/packages/:packageId/revisions",
    validateBody(createSubmittalRevisionSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const packageId = paramAsString(req.params.packageId);
        if (!packageId) throw new NotFoundError("Submittal package not found");
        const ctx = await resolvePackageContext(appDb, authUser.id, packageId);
        const revision = await submittalService.createSubmittalRevision(appDb, authUser.id, ctx, packageId, req.body);
        res.status(201).json(revision);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/revisions/:revisionId/reviews",
    validateBody(submitSubmittalReviewSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const revisionId = paramAsString(req.params.revisionId);
        if (!revisionId) throw new NotFoundError("Submittal revision not found");
        const submittal = await submittalService.findSubmittalByRevisionId(appDb, authUser.id, revisionId);
        if (!submittal) throw new NotFoundError("Submittal revision not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, submittal.projectId);
        const review = await submittalService.submitSubmittalReview(appDb, authUser.id, ctx, revisionId, authUser.id, req.body);
        res.json(review);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post("/:id/close", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Submittal not found");
      const submittal = await submittalService.findSubmittalById(appDb, authUser.id, id);
      if (!submittal) throw new NotFoundError("Submittal not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, submittal.projectId);
      const closed = await submittalService.closeSubmittal(appDb, authUser.id, ctx, id);
      res.json(closed);
    } catch (err) {
      next(err);
    }
  });

  async function resolvePackageContext(appDbInner: Database, userId: string, packageId: string) {
    const submittal = await submittalService.findSubmittalByPackageId(appDbInner, userId, packageId);
    if (!submittal) throw new NotFoundError("Submittal package not found");
    return loadPermissionContext(appDbInner, userId, submittal.projectId);
  }

  return router;
}
