import type { Database } from "@siteops/db";
import { createTmTicketSchema, listTmTicketsQuerySchema, transitionTmTicketStatusSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { loadPermissionContext } from "../services/permission.service";
import * as tmTicketService from "../services/tm-ticket.service";

export function tmTicketsRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  async function loadCtx(authUserId: string, ticketId: string) {
    const ticket = await tmTicketService.findTmTicketById(appDb, authUserId, ticketId);
    if (!ticket) throw new NotFoundError("T&M ticket not found");
    return { ctx: await loadPermissionContext(appDb, authUserId, ticket.projectId) };
  }

  router.post("/", validateBody(createTmTicketSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const ctx = await loadPermissionContext(appDb, authUser.id, req.body.projectId);
      const row = await tmTicketService.createTmTicket(appDb, authUser.id, ctx, req.body);
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
      const listQuery = listTmTicketsQuerySchema.parse({
        search: req.query.search,
        sort: req.query.sort,
        direction: req.query.direction,
        status: req.query.status,
        page: req.query.page,
        pageSize: req.query.pageSize,
      });
      const { rows, total } = await tmTicketService.listTmTickets(appDb, authUser.id, ctx, projectId, listQuery);
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
      if (!id) throw new NotFoundError("T&M ticket not found");
      const { ctx } = await loadCtx(authUser.id, id);
      const detail = await tmTicketService.getTmTicket(appDb, authUser.id, ctx, id);
      if (!detail) throw new NotFoundError("T&M ticket not found");
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/:id/transition",
    validateBody(transitionTmTicketStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const id = paramAsString(req.params.id);
        if (!id) throw new NotFoundError("T&M ticket not found");
        const { ctx } = await loadCtx(authUser.id, id);
        const updated = await tmTicketService.transitionTmTicketStatus(appDb, authUser.id, ctx, id, req.body);
        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
