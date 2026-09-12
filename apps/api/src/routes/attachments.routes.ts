import { confirmUploadSchema, requestUploadSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { S3Client } from "@aws-sdk/client-s3";
import type { Database } from "@siteops/db";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
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

  router.get("/:id/download", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Attachment not found");
      const attachment = await attachmentService.findAttachmentById(appDb, authUser.id, id);
      if (!attachment) throw new NotFoundError("Attachment not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, attachment.projectId);
      const result = await attachmentService.getDownloadUrl(deps, ctx, attachment);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
