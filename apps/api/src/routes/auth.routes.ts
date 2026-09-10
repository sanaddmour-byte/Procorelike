import { acceptInviteSchema, inviteUserSchema, loginSchema, refreshSchema } from "@siteops/shared";
import { requirePermission } from "@siteops/shared";
import { Router, type Request, type Response, type NextFunction } from "express";
import type { Env } from "../env";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as authService from "../services/auth.service";
import type { AuthDeps } from "../services/auth.service";
import { loadPermissionContext } from "../services/permission.service";

export function authRouter(deps: AuthDeps, env: Env): Router {
  const router = Router();

  router.post("/login", validateBody(loginSchema), (req: Request, res: Response, next: NextFunction) => {
    authService
      .login(deps, req.body)
      .then((tokens) => res.json(tokens))
      .catch(next);
  });

  router.post("/refresh", validateBody(refreshSchema), (req: Request, res: Response, next: NextFunction) => {
    authService
      .refresh(deps, req.body.refreshToken)
      .then((tokens) => res.json(tokens))
      .catch(next);
  });

  router.post("/logout", validateBody(refreshSchema), (req: Request, res: Response, next: NextFunction) => {
    authService
      .logout(deps, req.body.refreshToken)
      .then(() => res.status(204).send())
      .catch(next);
  });

  router.post(
    "/accept-invite",
    validateBody(acceptInviteSchema),
    (req: Request, res: Response, next: NextFunction) => {
      authService
        .acceptInvite(deps, req.body)
        .then((tokens) => res.status(201).json(tokens))
        .catch(next);
    },
  );

  router.post(
    "/invite",
    requireAuth(env),
    validateBody(inviteUserSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const ctx = await loadPermissionContext(deps.appDb, authUser.id, req.body.projectId);
        requirePermission(ctx, "directory", "admin");
        const result = await authService.createInvite(deps, authUser.id, req.body);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
