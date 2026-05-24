import "dotenv/config";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createServer } from "./server.js";

const config = loadConfig();
const logger = createLogger(config.logLevel);

const { app, server } = createServer(config, logger);

server.listen(config.port, () => {
  logger.info({ port: config.port, env: config.nodeEnv }, "Server started");

  if (!config.configured) {
    logger.warn("OpenSandbox not configured. Starting in setup mode. Visit /setup to configure.");
  } else {
    logger.info({ osbServerUrl: config.osbServerUrl }, "OpenSandbox Server URL");
  }
});

function gracefulShutdown(signal: string) {
  logger.info({ signal }, "Shutting down...");

  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
