import { createCompanySchema, uploadCompanyLogoSchema } from "@siteops/shared";
import { Router, type Request, type Response, type NextFunction } from "express";
import type { Database } from "@siteops/db";
import type { Env } from "../env";
import { NotFoundError } from "../lib/errors";
import { paramAsString } from "../lib/params";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import * as companyService from "../services/company.service";

export function companiesRouter(appDb: Database, env: Env): Router {
  const router = Router();
  router.use(requireAuth(env));

  router.post(
    "/",
    validateBody(createCompanySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const authUser = req.authUser;
        if (!authUser) throw new Error("requireAuth did not populate req.authUser");
        const company = await companyService.createCompany(appDb, authUser.id, req.body);
        res.status(201).json(company);
      } catch (err) {
        next(err);
      }
    },
  );

  router.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const companyList = await companyService.listMyCompanies(appDb, authUser.id);
      res.json(companyList);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/logo", validateBody(uploadCompanyLogoSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Company not found");
      const company = await companyService.uploadCompanyLogo(appDb, authUser.id, id, req.body);
      res.status(200).json(company);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id/logo", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authUser = req.authUser;
      if (!authUser) throw new Error("requireAuth did not populate req.authUser");
      const id = paramAsString(req.params.id);
      if (!id) throw new NotFoundError("Company not found");
      const logo = await companyService.getCompanyLogo(appDb, authUser.id, id);
      if (!logo) throw new NotFoundError("This company has no logo");
      res.setHeader("Content-Type", logo.mime);
      res.setHeader("Cache-Control", "private, max-age=300");
      res.send(Buffer.from(logo.dataBase64, "base64"));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
