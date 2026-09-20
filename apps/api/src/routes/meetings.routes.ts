import type { Database } from "@siteops/db";
import {
  carryForwardMeetingItemSchema,
  createMeetingItemSchema,
  createMeetingSchema,
  listMeetingsQuerySchema,
  transitionMeetingItemStatusSchema,
} from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as meetingService from "../services/meeting.service";
import { loadPermissionContext } from "../services/permission.service";

export function meetingsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/", validateBody(createMeetingSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await meetingService.createMeeting(appDb, authUser.id, ctx, req.body);
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
      const listQuery = listMeetingsQuerySchema.parse({
        search: req.query.search,
        sort: req.query.sort,
        direction: req.query.direction,
        page: req.query.page,
        pageSize: req.query.pageSize,
      });
      const { rows, total } = await meetingService.listMeetings(appDb, authUser.id, ctx, projectId, listQuery);
      // Backward compatible: the body is always a plain array (see rfis.routes.ts's
      // GET / for the full rationale), `X-Total-Count` is purely additive.
      res.setHeader("X-Total-Count", String(total));
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
      if (!id) throw new NotFoundError("Meeting not found");
      const meeting = await meetingService.findMeetingById(appDb, authUser.id, id);
      if (!meeting) throw new NotFoundError("Meeting not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, meeting.projectId);
      const detail = await meetingService.getMeeting(appDb, authUser.id, ctx, id);
      if (!detail) throw new NotFoundError("Meeting not found");
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/items", validateBody(createMeetingItemSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Meeting not found");
      const meeting = await meetingService.findMeetingById(appDb, authUser.id, id);
      if (!meeting) throw new NotFoundError("Meeting not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, meeting.projectId);
      const row = await meetingService.addMeetingItem(appDb, authUser.id, ctx, id, req.body);
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function meetingItemsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  async function loadCtx(authUserId: string, meetingItemId: string) {
    const item = await meetingService.findMeetingItemById(appDb, authUserId, meetingItemId);
    if (!item) throw new NotFoundError("Meeting item not found");
    const ctx = await loadPermissionContext(appDb, authUserId, item.projectId);
    return ctx;
  }

  router.patch(
    "/:id",
    validateBody(transitionMeetingItemStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Meeting item not found");
        const ctx = await loadCtx(authUser.id, id);
        const updated = await meetingService.transitionMeetingItemStatus(appDb, authUser.id, ctx, id, req.body);
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post(
    "/:id/carry-forward",
    validateBody(carryForwardMeetingItemSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("Meeting item not found");
        const ctx = await loadCtx(authUser.id, id);
        const row = await meetingService.carryForwardMeetingItem(appDb, authUser.id, ctx, id, req.body);
        res.status(201).json(row);
      } catch (err) {
        next(err);
      }
    },
  );

  router.post("/:id/convert-to-punch-item", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Meeting item not found");
      const ctx = await loadCtx(authUser.id, id);
      const updated = await meetingService.convertMeetingItemToPunchItem(appDb, authUser.id, ctx, id);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
