import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-correlation-id");
  req.correlationId = incoming && incoming.length > 0 ? incoming : randomUUID();
  res.setHeader("x-correlation-id", req.correlationId);
  next();
}
