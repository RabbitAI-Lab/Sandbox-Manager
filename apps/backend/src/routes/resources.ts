import { Router } from "express";
import type { Request, Response } from "express";

export const resourcesRouter = Router();

resourcesRouter.get("/", async (req: Request, res: Response) => {
  const {
    services,
  } = req.app.locals as import("../server.js").AppLocals;

  if (!services.resourceService) {
    res.status(503).json({
      success: false,
      error: { code: "NOT_CONFIGURED", message: "Resource monitoring not available" },
    });
    return;
  }

  try {
    const data = await services.resourceService.getClusterResources();
    res.json({ success: true, data });
  } catch {
    // Graceful degradation — return null data instead of error
    res.json({ success: true, data: null });
  }
});
