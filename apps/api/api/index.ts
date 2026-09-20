import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../src/app";
import { createApiDbClients } from "../src/db";
import { loadEnv } from "../src/env";

/**
 * Vercel serverless entrypoint. A plain Express app is itself a valid
 * (req, res) request handler, so this just wraps createApp's result for
 * Vercel's Node.js runtime -- the src/index.ts app.listen() entrypoint
 * (used by every other host in docs/DEPLOYMENT.md) is untouched. Module-level
 * initialization here runs once per cold start and is reused across warm
 * invocations of the same function instance, same as any other Vercel
 * serverless function.
 */
const env = loadEnv();
const clients = createApiDbClients(env);
const app = createApp(env, clients);

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  app(req, res);
}
