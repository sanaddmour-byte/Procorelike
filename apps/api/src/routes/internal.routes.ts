import type { S3Client } from "@aws-sdk/client-s3";
import type { Database } from "@siteops/db";
import { inboundEmailWebhookSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Transporter } from "nodemailer";
import type { Env } from "../env";
import { runDailyDigestSweep } from "../jobs/daily-digest-sweep";
import { runRfiOverdueSweep } from "../jobs/rfi-overdue-sweep";
import { logInboundEmail } from "../services/inbound-email.service";

/**
 * Machine-to-machine routes for an external cron (or, for
 * /inbound-email, an external mail provider's webhook), not a user
 * session — no JWT here, just a shared secret. There's no per-project
 * permission context that would make sense for a sweep spanning every
 * project, and no in-process scheduler in this codebase yet (see
 * jobs/rfi-overdue-sweep.ts's doc comment).
 */
export function internalRouter(authDb: Database, appDb: Database, s3: S3Client, mailer: Transporter, env: Env): Router {
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

  router.post("/daily-digest", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.header("x-internal-job-secret") !== env.INTERNAL_JOB_SECRET) {
        res.status(401).json({ error: { message: "Invalid internal job secret", code: "unauthorized" } });
        return;
      }
      const result = await runDailyDigestSweep(authDb, mailer, env);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/inbound-email", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.header("x-inbound-email-secret") !== env.INBOUND_EMAIL_WEBHOOK_SECRET) {
        res.status(401).json({ error: { message: "Invalid inbound email secret", code: "unauthorized" } });
        return;
      }
      const payload = inboundEmailWebhookSchema.parse(req.body);
      const result = await logInboundEmail({ authDb, appDb, s3, env }, payload);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
