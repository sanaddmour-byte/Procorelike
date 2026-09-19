import type { Database } from "@siteops/db";
import { registerPushTokenSchema, unregisterPushTokenSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as pushTokenService from "../services/push-token.service";

export function pushTokensRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(registerPushTokenSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const row = await pushTokenService.registerPushToken(appDb, authUser.id, req.body);
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/", validateBody(unregisterPushTokenSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      await pushTokenService.unregisterPushToken(appDb, authUser.id, req.body.token);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
