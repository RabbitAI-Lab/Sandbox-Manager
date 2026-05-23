import { Router, type Request, type Response } from "express";
import { SetupService } from "../services/setupService.js";
import { InfraRunner } from "../services/infraRunner.js";
import { loadConfig } from "../config.js";
import { reinitializeServices } from "../server.js";

export const setupRouter = Router();

// Guard: only one setup operation at a time
let setupInProgress = false;
let setupSucceeded = false;

function getAppLocals(req: Request) {
  return req.app.locals as import("../server.js").AppLocals;
}

// GET /api/setup/status
setupRouter.get("/status", (req, res) => {
  const { config, logger } = getAppLocals(req);
  const setupService = new SetupService(logger);
  const status = setupService.getSetupStatus(config);
  res.json({ success: true, data: status });
});

// POST /api/setup/test-connection
setupRouter.post("/test-connection", async (req, res) => {
  const { logger } = getAppLocals(req);
  const setupService = new SetupService(logger);

  const { serverUrl, apiKey, protocol } = req.body;
  if (!serverUrl) {
    res.status(400).json({ success: false, error: { code: "MISSING_FIELD", message: "serverUrl is required" } });
    return;
  }

  const result = await setupService.testConnection({
    serverUrl,
    apiKey: apiKey ?? "",
    protocol: protocol ?? "http",
  });

  res.json({ success: true, data: result });
});

// POST /api/setup/remote
setupRouter.post("/remote", async (req, res) => {
  const app = req.app;
  const { logger } = getAppLocals(req);
  const setupService = new SetupService(logger);

  const { serverUrl, apiKey, protocol } = req.body;
  if (!serverUrl || !apiKey) {
    res.status(400).json({ success: false, error: { code: "MISSING_FIELD", message: "serverUrl and apiKey are required" } });
    return;
  }

  try {
    await setupService.saveRemoteConfig({ serverUrl, apiKey, protocol: protocol ?? "http" });
    const newConfig = loadConfig();
    await reinitializeServices(app, newConfig, logger);
    res.json({ success: true, data: { configured: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, "Failed to save remote config");
    res.status(500).json({ success: false, error: { code: "SETUP_FAILED", message } });
  }
});

// GET /api/setup/local-k8s/stream — SSE endpoint
setupRouter.get("/local-k8s/stream", (req: Request, res: Response) => {
  if (setupInProgress) {
    res.status(409).json({ success: false, error: { code: "SETUP_IN_PROGRESS", message: "A setup operation is already in progress" } });
    return;
  }

  const { logger } = getAppLocals(req);
  const infraRunner = new InfraRunner(logger);

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const sendSSE = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Handle client disconnect — only stop port-forward if setup hasn't succeeded
  req.on("close", () => {
    logger.info("Client disconnected from setup SSE stream");
    if (!setupSucceeded) {
      infraRunner.stopPortForward();
    }
    setupInProgress = false;
  });

  setupInProgress = true;

  infraRunner.runLocalK8sSetup((event) => {
    sendSSE("progress", event);
  })
    .then(() => {
      setupSucceeded = true;
      sendSSE("done", { success: true });
      // Update the global infraRunner reference used by index.ts for shutdown
      (req.app.locals as Record<string, unknown>).infraRunner = infraRunner;
      res.end();
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      sendSSE("error", { message });
      res.end();
    })
    .finally(() => {
      setupInProgress = false;
    });
});

// POST /api/setup/complete — called after local K8s SSE stream succeeds
setupRouter.post("/complete", async (req, res) => {
  const app = req.app;
  const { logger } = getAppLocals(req);
  const setupService = new SetupService(logger);

  try {
    await setupService.saveLocalConfig();
    const newConfig = loadConfig();
    await reinitializeServices(app, newConfig, logger);
    res.json({ success: true, data: { configured: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, "Failed to complete local setup");
    res.status(500).json({ success: false, error: { code: "SETUP_FAILED", message } });
  }
});
