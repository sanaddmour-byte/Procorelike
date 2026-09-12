import type { Database } from "@siteops/db";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Transporter } from "nodemailer";
import type { Env } from "../env";
import { runRfiOverdueSweep } from "../jobs/rfi-overdue-sweep";

/**
 * Machine-to-machine routes for an external cron, not a user session — no
 * JWT here, just a shared secret. There's no per-project permission
 * context that would make sense for a sweep spanning every project, and
 * no in-process scheduler in this codebase yet (see
 * jobs/rfi-overdue-sweep.ts's doc comment).
 */
export function internalRouter(authDb: Database, mailer: Transporter, env: Env): Router {
  const router = Router();

  router.post("/rfi-overdue-check", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.header("x-internal-job-secret") !== env.INTERNAL_JOB_SECRET) {
        res.status(401).json({ error: { message: "Invalid internal job secret", code: "unauthorized" } });
        return;
      }
      const result = await runRfiOverdueSweep(authDb, mailer, env);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
