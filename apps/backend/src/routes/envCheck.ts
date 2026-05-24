import { Router } from "express";
import type { Request } from "express";
import type { AppServices } from "../server.js";
import type { Logger } from "../logger.js";
import type { ApiResponse } from "../types/index.js";
import { checkIngressNginx, installIngressNginx, checkDomainConfig, checkDnsmasq, installDnsmasq } from "../services/envCheckService.js";

export const envCheckRouter = Router();

function getLogger(req: Request): Logger {
  const { logger } = req.app.locals as { services: AppServices; logger: Logger };
  return logger;
}

// Run all environment checks
envCheckRouter.get("/", async (_req, res, next) => {
  try {
    const logger = getLogger(_req);
    const domainCheck = checkDomainConfig(logger);
    const ingressCheck = await checkIngressNginx(logger);
    const dnsmasqCheck = await checkDnsmasq(logger);
    res.json({ success: true, data: [domainCheck, ingressCheck, dnsmasqCheck] } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// Install a specific component
envCheckRouter.post("/:id/install", async (req, res, next) => {
  try {
    const logger = getLogger(req);
    const { id } = req.params;

    if (id === "ingress-nginx") {
      const result = await installIngressNginx(logger);
      res.json({ success: true, data: result } as ApiResponse);
    } else if (id === "dnsmasq") {
      const result = await installDnsmasq(logger);
      res.json({ success: true, data: result } as ApiResponse);
    } else {
      res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: `Unknown check item: ${id}` },
      });
    }
  } catch (err) {
    next(err);
  }
});
