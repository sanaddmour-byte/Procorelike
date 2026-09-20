import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_APP: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),
  INVITE_TOKEN_SECRET: z.string().min(16),
  API_PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("siteops-attachments"),
  S3_ACCESS_KEY_ID: z.string().default("siteops"),
  S3_SECRET_ACCESS_KEY: z.string().default("siteops123"),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_FROM: z.string().default("no-reply@siteops.local"),
  /** Shared secret an external cron presents to trigger the overdue-RFI sweep — there's no per-project permission context for a system-wide job, and no in-process scheduler (see jobs/rfi-overdue-sweep.ts). */
  INTERNAL_JOB_SECRET: z.string().min(16).default("dev-internal-job-secret-change-me"),
  /** Domain half of every project's inbound-email alias (`<projects.inbound_email_token>@INBOUND_EMAIL_DOMAIN`) — see inbound-email.service.ts. Not a real deliverable mailbox by itself; a production deployment points an actual inbound-email provider's MX/webhook at this domain. */
  INBOUND_EMAIL_DOMAIN: z.string().default("inbound.siteops.local"),
  /** Shared secret the inbound-email webhook requires, separate from INTERNAL_JOB_SECRET since this endpoint is reachable by an external mail provider rather than only our own cron. */
  INBOUND_EMAIL_WEBHOOK_SECRET: z.string().min(16).default("dev-inbound-email-secret-change-me"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  return parsed.data;
}
