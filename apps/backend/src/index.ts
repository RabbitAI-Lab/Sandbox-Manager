import "dotenv/config";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createServer } from "./server.js";
import { InfraRunner } from "./services/infraRunner.js";

const config = loadConfig();
const logger = createLogger(config.logLevel);

const { app, server } = createServer(config, logger);

// Helper to check if the configured server URL is local K8s mode
function isLocalK8sMode(url: string): boolean {
  return url.includes("localhost") || url.includes("127.0.0.1");
}

// InfraRunner for port-forward management (local K8s only)
let infraRunner: InfraRunner | null = null;

server.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, "Server started");

  if (!config.configured) {
    logger.warn("OpenSandbox not configured. Starting in setup mode. Visit /setup to configure.");
  } else {
    logger.info({ osbServerUrl: config.osbServerUrl }, "OpenSandbox Server URL");

    // Auto-start port-forward for local K8s mode
    if (isLocalK8sMode(config.osbServerUrl)) {
      infraRunner = new InfraRunner(logger);
      (app.locals as Record<string, unknown>).infraRunner = infraRunner;

      // Parse local port from URL (e.g. "localhost:8080" -> 8080)
      const portMatch = config.osbServerUrl.match(/:(\d+)/);
      const localPort = portMatch ? parseInt(portMatch[1], 10) : 8080;

      logger.info({ localPort }, "Local K8s mode detected, starting port-forward...");
      infraRunner.startPortForward(localPort, 80).catch((err) => {
        logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          "Failed to auto-start port-forward. OpenSandbox may be unreachable.",
        );
      });
    }
  }
});

function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Shutting down...");

  // Stop port-forward if running
  if (infraRunner) {
    infraRunner.stopPortForward();
  }

  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
