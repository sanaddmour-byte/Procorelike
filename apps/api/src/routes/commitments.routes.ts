import type { Database } from "@siteops/db";
import { createCommitmentLineItemSchema, createCommitmentSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as commitmentService from "../services/commitment.service";
import { loadPermissionContext } from "../services/permission.service";

export function commitmentsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createCommitmentSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await commitmentService.createCommitment(appDb, authUser.id, ctx, req.body);
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
      const rows = await commitmentService.listCommitments(appDb, authUser.id, ctx, projectId);
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
      if (!id) throw new NotFoundError("Commitment not found");
      const commitment = await commitmentService.findCommitmentById(appDb, authUser.id, id);
      if (!commitment) throw new NotFoundError("Commitment not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, commitment.projectId);
      const detail = await commitmentService.getCommitment(appDb, authUser.id, ctx, id);
      if (!detail) throw new NotFoundError("Commitment not found");
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/line-items",
    validateBody(createCommitmentLineItemSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Commitment not found");
        const commitment = await commitmentService.findCommitmentById(appDb, authUser.id, id);
        if (!commitment) throw new NotFoundError("Commitment not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, commitment.projectId);
        const row = await commitmentService.addCommitmentLineItem(appDb, authUser.id, ctx, id, req.body);
        res.status(201).json(row);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
