import { Router } from "express";
import type { Application } from "express";
import { healthRouter } from "./health.js";
import { sandboxesRouter } from "./sandboxes.js";
import { setupRouter } from "./setup.js";
import { imagesRouter } from "./images.js";
import { profilesRouter } from "./profiles.js";
import { domainsRouter } from "./domains.js";
import { envCheckRouter } from "./envCheck.js";
import { resourcesRouter } from "./resources.js";

export function registerRoutes(app: Application) {
  app.use("/api/health", healthRouter);
  app.use("/api/setup", setupRouter);
  app.use("/api/sandboxes", sandboxesRouter);
  app.use("/api/images", imagesRouter);
  app.use("/api/profiles", profilesRouter);
  app.use("/api/domains", domainsRouter);
  app.use("/api/env-check", envCheckRouter);
  app.use("/api/resources", resourcesRouter);
}

export { healthRouter, sandboxesRouter, imagesRouter };
