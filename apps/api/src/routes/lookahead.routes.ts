import type { Database } from "@siteops/db";
import { createLookaheadCommitmentSchema, createLookaheadPlanSchema, recordCommitmentActualSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as lookaheadService from "../services/lookahead.service";
import { loadPermissionContext } from "../services/permission.service";

function requireQueryString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new NotFoundError(`${name} query param is required`);
  return value;
}

export function lookaheadRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get("/view", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = requireQueryString(req.query.projectId, "projectId");
      const weekStart = requireQueryString(req.query.weekStart, "weekStart");
      const horizonWeeks = Number(req.query.horizonWeeks ?? 3);
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const view = await lookaheadService.getLookaheadView(appDb, authUser.id, ctx, projectId, weekStart, horizonWeeks);
      res.json(view);
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = requireQueryString(req.query.projectId, "projectId");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const companies = await lookaheadService.listProjectCompanyNames(appDb, authUser.id, ctx, projectId);
      res.json(companies);
    } catch (err) {
      next(err);
    }
  });

  router.get("/delays", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = requireQueryString(req.query.projectId, "projectId");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const register = await lookaheadService.getDelayRegister(appDb, authUser.id, ctx, projectId);
      res.json(register);
    } catch (err) {
      next(err);
    }
  });

  router.post("/plans", validateBody(createLookaheadPlanSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const plan = await lookaheadService.createLookaheadPlan(appDb, authUser.id, ctx, req.body);
      res.status(201).json(plan);
    } catch (err) {
      next(err);
    }
  });

  router.get("/plans", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = requireQueryString(req.query.projectId, "projectId");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const plans = await lookaheadService.listLookaheadPlans(appDb, authUser.id, ctx, projectId);
      res.json(plans);
    } catch (err) {
      next(err);
    }
  });

  router.get("/plans/:planId/commitments", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const planId = paramAsString(req.params.planId);
      if (!planId) throw new NotFoundError("Look-ahead plan not found");
      const projectId = await lookaheadService.findLookaheadPlanProjectId(appDb, authUser.id, planId);
      if (!projectId) throw new NotFoundError("Look-ahead plan not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const commitments = await lookaheadService.listCommitmentsForPlan(appDb, authUser.id, ctx, planId);
      res.json(commitments);
    } catch (err) {
      next(err);
    }
  });

  router.get("/plans/:planId/ppc", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const planId = paramAsString(req.params.planId);
      if (!planId) throw new NotFoundError("Look-ahead plan not found");
      const projectId = await lookaheadService.findLookaheadPlanProjectId(appDb, authUser.id, planId);
      if (!projectId) throw new NotFoundError("Look-ahead plan not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const ppc = await lookaheadService.getPpcForPlan(appDb, authUser.id, ctx, planId);
      res.json(ppc);
    } catch (err) {
      next(err);
    }
  });

  router.post("/commitments", validateBody(createLookaheadCommitmentSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = await lookaheadService.findLookaheadPlanProjectId(appDb, authUser.id, req.body.lookaheadPlanId);
      if (!projectId) throw new NotFoundError("Look-ahead plan not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const commitment = await lookaheadService.createLookaheadCommitment(appDb, authUser.id, ctx, req.body);
      res.status(201).json(commitment);
    } catch (err) {
      next(err);
    }
  });

  async function handleConfirmation(req: Request, res: Response, next: NextFunction, action: "confirmed" | "declined"): Promise<void> {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const commitmentId = paramAsString(req.params.commitmentId);
      if (!commitmentId) throw new NotFoundError("Commitment not found");
      const projectId = await lookaheadService.findCommitmentProjectId(appDb, authUser.id, commitmentId);
      if (!projectId) throw new NotFoundError("Commitment not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const commitment = await lookaheadService.setCommitmentConfirmation(appDb, authUser.id, ctx, projectId, commitmentId, action);
      res.json(commitment);
    } catch (err) {
      next(err);
    }
  }

  router.post("/commitments/:commitmentId/confirm", (req, res, next) => void handleConfirmation(req, res, next, "confirmed"));
  router.post("/commitments/:commitmentId/decline", (req, res, next) => void handleConfirmation(req, res, next, "declined"));

  router.post(
    "/commitments/:commitmentId/actual",
    validateBody(recordCommitmentActualSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const commitmentId = paramAsString(req.params.commitmentId);
        if (!commitmentId) throw new NotFoundError("Commitment not found");
        const projectId = await lookaheadService.findCommitmentProjectId(appDb, authUser.id, commitmentId);
        if (!projectId) throw new NotFoundError("Commitment not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
        const commitment = await lookaheadService.recordCommitmentActual(appDb, authUser.id, ctx, commitmentId, req.body);
        res.json(commitment);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
