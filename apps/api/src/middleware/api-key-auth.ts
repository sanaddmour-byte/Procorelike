import type { Database } from "@siteops/db";
import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../lib/errors";
import { verifyApiKeyAndTouch } from "../services/api-key.service";

/**
 * Authenticates the /external/v1 surface via `X-API-Key` instead of a JWT
 * bearer token. Resolves the key to its creator and populates
 * req.authUser exactly like requireAuth does, so every downstream
 * permission-context/RLS check (loadPermissionContext, hasPermission,
 * withRequestContext) runs completely unchanged -- an API key is not a
 * separate authorization model, it's just a different way to arrive at
 * the same req.authUser.
 */
export function requireApiKey(authDb: Database) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const key = req.header("x-api-key");
    if (!key) {
      next(new UnauthorizedError("Missing X-API-Key header"));
      return;
    }
    try {
      const resolved = await verifyApiKeyAndTouch(authDb, key);
      if (!resolved) {
        next(new UnauthorizedError("Invalid or revoked API key"));
        return;
      }
      req.authUser = { id: resolved.userId, email: resolved.email };
      next();
    } catch {
      next(new UnauthorizedError("Invalid or revoked API key"));
    }
  };
}
