import type { Database } from "@siteops/db";
import { listNotificationsQuerySchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import * as notificationService from "../services/notification.service";

export function notificationsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const query = listNotificationsQuerySchema.parse({
        unreadOnly: req.query.unreadOnly,
        limit: req.query.limit,
      });
      const notifications = await notificationService.listNotifications(appDb, authUser.id, query);
      res.json(notifications);
    } catch (err) {
      next(err);
    }
  });

  router.get("/unread-count", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const count = await notificationService.countUnreadNotifications(appDb, authUser.id);
      res.json({ count });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:notificationId/read", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const notificationId = paramAsString(req.params.notificationId);
      if (!notificationId) throw new NotFoundError("Notification not found");
      const notification = await notificationService.markNotificationRead(appDb, authUser.id, notificationId);
      res.json(notification);
    } catch (err) {
      next(err);
    }
  });

  router.post("/read-all", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      await notificationService.markAllNotificationsRead(appDb, authUser.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
