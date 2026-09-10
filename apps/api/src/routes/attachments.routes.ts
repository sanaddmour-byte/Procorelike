import { confirmUploadSchema, requestUploadSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { S3Client } from "@aws-sdk/client-s3";
import type { Database } from "@siteops/db";
import type { Env } from "../env";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as attachmentService from "../services/attachment.service";
import { loadPermissionContext } from "../services/permission.service";

export function attachmentsRouter(appDb: Database, s3: S3Client, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));
  const deps = { appDb, s3, env };

  router.post(
    "/presign",
    validateBody(requestUploadSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
        const result = await attachmentService.requestUploadUrl(deps, authUser.id, ctx, req.body);
        res.json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/confirm",
    validateBody(confirmUploadSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
        const result = await attachmentService.confirmUpload(deps, authUser.id, ctx, req.body);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
