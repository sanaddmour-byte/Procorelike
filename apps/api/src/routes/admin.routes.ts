import type { Database } from "@siteops/db";
import { createApiKeySchema, createWebhookSubscriptionSchema } from "@siteops/shared";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as apiKeyService from "../services/api-key.service";
import * as webhookService from "../services/webhook.service";
import { getCompanyDashboard } from "../services/company-dashboard.service";
import { exportBudgetCsv, exportCommitmentsIif } from "../services/export.service";
import { loadPermissionContext } from "../services/permission.service";

/**
 * Company-level Admin Console (API keys, webhooks) plus the cross-project
 * Company Dashboard and project-level CSV/IIF exports -- the Admin layer's
 * three parts (docs/ARCHITECTURE.md's Procore-parity roadmap, item 6/6).
 * API keys/webhooks are gated purely by RLS's is_company_member (this is
 * company-level admin, not a project permission module); exports are
 * gated by loadPermissionContext + requirePermission like everything else
 * project-scoped.
 */
export function adminRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post("/api-keys", validateBody(createApiKeySchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const key = await apiKeyService.createApiKey(appDb, authUser.id, req.body);
      res.status(201).json(key);
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/api-keys", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const companyId = paramAsString(req.params.companyId);
      if (!companyId) throw new NotFoundError("Company not found");
      const keys = await apiKeyService.listApiKeys(appDb, authUser.id, companyId);
      res.json(keys);
    } catch (err) {
      next(err);
    }
  });

  router.post("/companies/:companyId/api-keys/:keyId/revoke", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const companyId = paramAsString(req.params.companyId);
      const keyId = paramAsString(req.params.keyId);
      if (!companyId || !keyId) throw new NotFoundError("API key not found");
      const key = await apiKeyService.revokeApiKey(appDb, authUser.id, companyId, keyId);
      res.json(key);
    } catch (err) {
      next(err);
    }
  });

  router.post("/webhooks", validateBody(createWebhookSubscriptionSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const subscription = await webhookService.createWebhookSubscription(appDb, authUser.id, req.body);
      res.status(201).json(subscription);
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/webhooks", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const companyId = paramAsString(req.params.companyId);
      if (!companyId) throw new NotFoundError("Company not found");
      const subscriptions = await webhookService.listWebhookSubscriptions(appDb, authUser.id, companyId);
      res.json(subscriptions);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/companies/:companyId/webhooks/:subscriptionId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const companyId = paramAsString(req.params.companyId);
      const subscriptionId = paramAsString(req.params.subscriptionId);
      if (!companyId || !subscriptionId) throw new NotFoundError("Webhook subscription not found");
      await webhookService.deleteWebhookSubscription(appDb, authUser.id, companyId, subscriptionId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  router.get("/webhooks/:subscriptionId/deliveries", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const subscriptionId = paramAsString(req.params.subscriptionId);
      if (!subscriptionId) throw new NotFoundError("Webhook subscription not found");
      const deliveries = await webhookService.listWebhookDeliveries(appDb, authUser.id, subscriptionId);
      res.json(deliveries);
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/dashboard", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const companyId = paramAsString(req.params.companyId);
      if (!companyId) throw new NotFoundError("Company not found");
      const dashboard = await getCompanyDashboard(appDb, authUser.id, companyId);
      res.json(dashboard);
    } catch (err) {
      next(err);
    }
  });

  router.get("/projects/:projectId/exports/budget.csv", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = paramAsString(req.params.projectId);
      if (!projectId) throw new NotFoundError("Project not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const csv = await exportBudgetCsv(appDb, authUser.id, ctx, projectId);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="budget-${projectId}.csv"`);
      res.send(csv);
    } catch (err) {
      next(err);
    }
  });

  router.get("/projects/:projectId/exports/commitments.iif", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const projectId = paramAsString(req.params.projectId);
      if (!projectId) throw new NotFoundError("Project not found");
      const ctx = await loadPermissionContext(appDb, authUser.id, projectId);
      const iif = await exportCommitmentsIif(appDb, authUser.id, ctx, projectId);
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Disposition", `attachment; filename="commitments-${projectId}.iif"`);
      res.send(iif);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
