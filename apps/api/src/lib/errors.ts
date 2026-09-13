import { PermissionDeniedError, ScheduleImportRejectedError } from "@siteops/shared";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Authentication required") {
    super(401, "unauthorized", message);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found") {
    super(404, "not_found", message);
  }
}

/**
 * Every error surfaces to the caller with an actionable message and a
 * correlation ID, and is logged server-side with the same ID (Rule 9) — no
 * silent catches, no bare 500s without a trace.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const correlationId = req.correlationId;

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: { message: err.message, code: err.code, correlationId },
    });
    return;
  }

  if (err instanceof PermissionDeniedError) {
    res.status(403).json({
      error: { message: err.message, code: "permission_denied", correlationId },
    });
    return;
  }

  if (err instanceof ScheduleImportRejectedError) {
    res.status(400).json({
      error: { message: err.message, code: "schedule_import_rejected", correlationId, details: err.errors },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { message: err.issues.map((i) => i.message).join("; "), code: "validation_error", correlationId },
    });
    return;
  }

  console.error(`[${correlationId}]`, err);
  res.status(500).json({
    error: { message: `Internal server error (ref: ${correlationId})`, code: "internal_error", correlationId },
  });
}
