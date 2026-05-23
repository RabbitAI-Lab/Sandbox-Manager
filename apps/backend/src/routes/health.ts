import { Router } from "express";
import type { Request, Response } from "express";

export const healthRouter = Router();

healthRouter.get("/", (req: Request, res: Response) => {
  const { config, services, logger } = req.app.locals as import("../server.js").AppLocals;

  // Not configured at all — needs setup
  if (!config.configured || !services.sandboxService) {
    res.json({
      success: true,
      data: {
        status: "ok",
        configured: false,
        opensandboxReady: false,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
    });
    return;
  }

  // Configured — check if OpenSandbox is reachable
  services.sandboxService.listSandboxInfos({ page: 1, pageSize: 1 })
    .then(() => {
      res.json({
        success: true,
        data: {
          status: "ok",
          configured: true,
          opensandboxReady: true,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        },
      });
    })
    .catch(() => {
      // Configured but unreachable — don't trigger re-setup
      res.json({
        success: true,
        data: {
          status: "ok",
          configured: true,
          opensandboxReady: false,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        },
      });
    });
});
