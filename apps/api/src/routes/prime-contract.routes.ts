import type { Database } from "@siteops/db";
import { createPrimeContractSchema, transitionPrimeContractStatusSchema, updatePrimeContractSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as primeContractService from "../services/prime-contract.service";
import { loadPermissionContext } from "../services/permission.service";

export function primeContractRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createPrimeContractSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await primeContractService.createPrimeContract(appDb, authUser.id, ctx, req.body);
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
      const row = await primeContractService.getPrimeContractByProject(appDb, authUser.id, ctx, projectId);
      if (!row) throw new NotFoundError("Prime contract not found");
      res.json(row);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", validateBody(updatePrimeContractSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Prime contract not found");
      const contract = await primeContractService.findPrimeContractById(appDb, authUser.id, id);
      if (!contract) throw new NotFoundError("Prime contract not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, contract.projectId);
      const updated = await primeContractService.updatePrimeContract(appDb, authUser.id, ctx, id, req.body);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/transition",
    validateBody(transitionPrimeContractStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Prime contract not found");
        const contract = await primeContractService.findPrimeContractById(appDb, authUser.id, id);
        if (!contract) throw new NotFoundError("Prime contract not found");
        const ctx = await loadPermissionContext(appDb, authUser.id, contract.projectId);
        const updated = await primeContractService.transitionPrimeContractStatus(appDb, authUser.id, ctx, id, req.body.toStatus);
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
