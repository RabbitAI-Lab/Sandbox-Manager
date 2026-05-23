import { Router } from "express";
import type { Application } from "express";
import { healthRouter } from "./health.js";
import { sandboxesRouter } from "./sandboxes.js";
import { setupRouter } from "./setup.js";
import { imagesRouter } from "./images.js";

export function registerRoutes(app: Application) {
  app.use("/api/health", healthRouter);
  app.use("/api/setup", setupRouter);
  app.use("/api/sandboxes", sandboxesRouter);
  app.use("/api/images", imagesRouter);
}

export { healthRouter, sandboxesRouter, imagesRouter };
