import type { NextFunction, Request, Response } from "express";
import type { Env } from "../env";
import { verifyAccessToken } from "../lib/jwt";
import { UnauthorizedError } from "../lib/errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: { id: string; email: string };
    }
  }
}

export function requireAuth(env: Env) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header("authorization");
    if (!header?.startsWith("Bearer ")) {
      next(new UnauthorizedError("Missing bearer token"));
      return;
    }
    const token = header.slice("Bearer ".length);
    try {
      const claims = verifyAccessToken(env, token);
      req.authUser = { id: claims.sub, email: claims.email };
      next();
    } catch {
      next(new UnauthorizedError("Invalid or expired access token"));
    }
  };
}
