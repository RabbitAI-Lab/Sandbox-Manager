import { Router } from "express";
import type { Request } from "express";
import { filesRouter } from "./files.js";
import { commandsRouter } from "./commands.js";
import type { AppServices } from "../server.js";
import type { SandboxService } from "../services/sandboxService.js";
import type { ApiResponse, CreateSandboxBody, SandboxEndpointResponse } from "../types/index.js";

export const sandboxesRouter = Router();

/**
 * Normalize SDK sandbox info into a flat format the frontend expects.
 * SDK returns status as {state, reason, message, lastTransitionAt} and image as {uri}.
 * Frontend expects status as string and image as string.
 */
function normalizeSandbox(raw: Record<string, unknown>) {
  const statusObj = raw.status as Record<string, unknown> | undefined;
  const imageObj = raw.image as Record<string, unknown> | undefined;

  return {
    id: raw.id as string,
    name: raw.name as string | undefined,
    image: (imageObj?.uri ?? raw.image ?? "") as string,
    status: (statusObj?.state ?? raw.status ?? "Unknown") as string,
    statusDetail: statusObj ?? undefined,
    createdAt: raw.createdAt as string | undefined,
    expiresAt: raw.expiresAt as string | undefined,
    entrypoint: raw.entrypoint as string[] | undefined,
    metadata: raw.metadata as Record<string, string> | undefined,
    env: raw.env as Record<string, string> | undefined,
  };
}

// Guard: reject sandbox operations when OpenSandbox is not configured
sandboxesRouter.use((_req, res, next) => {
  const { services } = res.app.locals as { services: AppServices };
  if (!services.sandboxService) {
    res.status(503).json({
      success: false,
      error: { code: "NOT_CONFIGURED", message: "OpenSandbox is not configured. Please complete setup first." },
    });
    return;
  }
  next();
});

function getParam(req: Request, name: string): string {
  return (req.params as Record<string, string>)[name];
}

// Safe accessor — guard middleware ensures sandboxService is not null
function getSandboxService(req: Request): SandboxService {
  const { services } = req.app.locals as { services: AppServices };
  return services.sandboxService!;
}

// Mount sub-routers
sandboxesRouter.use("/:sandboxId/files", filesRouter);
sandboxesRouter.use("/:sandboxId/commands", commandsRouter);

// List sandboxes
sandboxesRouter.get("/", async (req, res, next) => {
  try {
    const svc = getSandboxService(req);
    const states = req.query.state
      ? Array.isArray(req.query.state)
        ? req.query.state as string[]
        : [req.query.state as string]
      : undefined;

    const result = await svc.listSandboxInfos({
      states,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    });

    // Normalize items from SDK format to flat frontend format
    const rawItems = (result as Record<string, unknown>).items as Record<string, unknown>[];
    const now = new Date();
    const items = rawItems
      .map(normalizeSandbox)
      .filter((sb) => {
        // Filter out expired sandboxes
        if (sb.expiresAt && new Date(sb.expiresAt) < now) return false;
        return true;
      });
    const pagination = (result as Record<string, unknown>).pagination;

    res.json({ success: true, data: { items, pagination } } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// Create sandbox
sandboxesRouter.post("/", async (req, res, next) => {
  try {
    const svc = getSandboxService(req);
    const body = req.body as CreateSandboxBody;
    const result = await svc.createSandbox(body);
    res.status(202).json({ success: true, data: normalizeSandbox(result as Record<string, unknown>) } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// Get sandbox info
sandboxesRouter.get("/:sandboxId", async (req, res, next) => {
  try {
    const svc = getSandboxService(req);
    const result = await svc.getSandboxInfo(getParam(req, "sandboxId"));
    res.json({ success: true, data: normalizeSandbox(result as Record<string, unknown>) } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// Delete sandbox
sandboxesRouter.delete("/:sandboxId", async (req, res, next) => {
  try {
    const svc = getSandboxService(req);
    await svc.killSandbox(getParam(req, "sandboxId"));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Pause sandbox
sandboxesRouter.post("/:sandboxId/pause", async (req, res, next) => {
  try {
    const svc = getSandboxService(req);
    await svc.pauseSandbox(getParam(req, "sandboxId"));
    res.json({ success: true } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// Resume sandbox
sandboxesRouter.post("/:sandboxId/resume", async (req, res, next) => {
  try {
    const svc = getSandboxService(req);
    await svc.resumeSandbox(getParam(req, "sandboxId"));
    res.json({ success: true } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// Get sandbox endpoint URL
sandboxesRouter.get("/:sandboxId/endpoints/:port", async (req, res, next) => {
  try {
    const svc = getSandboxService(req);
    const sandboxId = getParam(req, "sandboxId");
    const port = getParam(req, "port");
    const sandbox = await svc.getConnectedSandbox(sandboxId);
    const portNum = parseInt(port, 10);
    const url = await sandbox.getEndpointUrl(portNum);

    const response: ApiResponse<SandboxEndpointResponse> = {
      success: true,
      data: {
        url,
        scheme: url.startsWith("https") ? "https" : "http",
        host: url.replace(/^https?:\/\//, ""),
        port: url.startsWith("https") ? 443 : 80,
      },
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});
