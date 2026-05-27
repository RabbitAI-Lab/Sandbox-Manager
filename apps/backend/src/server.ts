import http from "node:http";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import type { Duplex } from "node:stream";
import type { Config } from "./config.js";
import type { Logger } from "./logger.js";
import { SandboxService } from "./services/sandboxService.js";
import { ImageService } from "./services/imageService.js";
import { ResourceService } from "./services/resourceService.js";
import { ConnectionManager } from "./websocket/connectionManager.js";
import { PtyRelay } from "./websocket/ptyRelay.js";
import { registerRoutes } from "./routes/index.js";
import { errorHandler } from "./middleware/error.js";

export interface AppServices {
  sandboxService: SandboxService | null;
  imageService: ImageService;
  resourceService?: ResourceService;
  connectionManager: ConnectionManager;
  ptyRelay: PtyRelay;
}

export interface AppLocals {
  services: AppServices;
  config: Config;
  logger: Logger;
}

declare global {
  namespace Express {
    interface Application {
      locals: AppLocals;
    }
  }
}

export function createServer(config: Config, logger: Logger) {
  const app = express();

  // Middleware
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "1mb" }));

  // Request ID + logging
  app.use((req, _res, next) => {
    req.headers["x-request-id"] = req.headers["x-request-id"] ?? crypto.randomUUID();
    logger.debug({ method: req.method, path: req.path }, "Request");
    next();
  });

  // Initialize services — sandboxService is null when not yet configured
  const resourceService = new ResourceService(logger, config.sandboxNamespace, config.resourceCheckEnabled);
  const sandboxService = config.configured ? new SandboxService(config, logger, resourceService) : null;
  const imageService = new ImageService(logger);
  const connectionManager = new ConnectionManager(config, logger);
  const ptyRely = new PtyRelay(sandboxService, connectionManager, config, logger);

  const services: AppServices = { sandboxService, imageService, resourceService, connectionManager, ptyRelay: ptyRely };

  // Store services on app for route access
  app.locals.services = services;
  app.locals.config = config;
  app.locals.logger = logger;

  // Register REST routes
  registerRoutes(app);

  // Error handler (must be last)
  app.use(errorHandler);

  // Create HTTP server from Express app
  const server = http.createServer(app);

  // WebSocket server with noServer for manual upgrade handling
  const wss = new WebSocketServer({ noServer: true });

  // Handle HTTP upgrade for PTY WebSocket
  server.on("upgrade", (req, socket: Duplex, head) => {
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/api\/sandboxes\/([^/]+)\/pty$/);

    if (match) {
      const sandboxId = match[1];
      logger.info({ sandboxId, ip: req.socket.remoteAddress }, "PTY WebSocket upgrade");
      ptyRely.handleUpgrade(wss, req, socket, head, sandboxId);
    } else {
      socket.destroy();
    }
  });

  return { app, server, wss, services };
}

/**
 * Reinitialize services after setup configuration changes.
 * Disposes old services and creates new ones with the updated config.
 */
export async function reinitializeServices(
  app: express.Application,
  newConfig: Config,
  logger: Logger,
) {
  const oldServices = app.locals.services as AppServices;

  // Dispose old sandbox service
  if (oldServices.sandboxService) {
    await oldServices.sandboxService.dispose();
  }

  // Create new services
  const resourceService = new ResourceService(logger, newConfig.sandboxNamespace, newConfig.resourceCheckEnabled);
  const sandboxService = newConfig.configured ? new SandboxService(newConfig, logger, resourceService) : null;
  const imageService = new ImageService(logger);
  const connectionManager = new ConnectionManager(newConfig, logger);
  const ptyRelay = new PtyRelay(sandboxService, connectionManager, newConfig, logger);

  app.locals.services = { sandboxService, imageService, resourceService, connectionManager, ptyRelay };
  app.locals.config = newConfig;

  logger.info({ configured: newConfig.configured }, "Services reinitialized");
}
