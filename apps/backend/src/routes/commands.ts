import { Router } from "express";
import type { Request } from "express";
import type { AppServices } from "../server.js";
import type { ApiResponse, RunCommandBody, RunInSessionBody } from "../types/index.js";

export const commandsRouter = Router({ mergeParams: true });

function getParam(req: Request, name: string): string {
  return (req.params as Record<string, string>)[name];
}

// Execute command (aggregated response)
commandsRouter.post("/", async (req, res, next) => {
  try {
    const { services } = req.app.locals as { services: AppServices };
    const sandboxId = getParam(req, "sandboxId");
    const { command, cwd, timeoutSeconds, envs } = req.body as RunCommandBody;

    if (!command) {
      res.status(400).json({ success: false, error: { code: "MISSING_COMMAND", message: "command is required" } });
      return;
    }

    const sandbox = await services.sandboxService!.getConnectedSandbox(sandboxId);
    const result = await sandbox.commands.run(command, {
      workingDirectory: cwd,
      timeoutSeconds,
      envs,
    });

    res.json({ success: true, data: result } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// Create bash session
commandsRouter.post("/session", async (req, res, next) => {
  try {
    const { services } = req.app.locals as { services: AppServices };
    const sandboxId = getParam(req, "sandboxId");
    const { workingDirectory } = (req.body || {}) as { workingDirectory?: string };

    const sandbox = await services.sandboxService!.getConnectedSandbox(sandboxId);
    const sessionId = await sandbox.commands.createSession({
      workingDirectory,
    });

    res.json({ success: true, data: { sessionId } } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// Run command in session
commandsRouter.post("/session/:sessionId/run", async (req, res, next) => {
  try {
    const { services } = req.app.locals as { services: AppServices };
    const sandboxId = getParam(req, "sandboxId");
    const sessionId = getParam(req, "sessionId");
    const { command, cwd, timeoutSeconds } = req.body as RunInSessionBody;

    if (!command) {
      res.status(400).json({ success: false, error: { code: "MISSING_COMMAND", message: "command is required" } });
      return;
    }

    const sandbox = await services.sandboxService!.getConnectedSandbox(sandboxId);
    const result = await sandbox.commands.runInSession(sessionId, command, {
      workingDirectory: cwd,
      timeoutSeconds,
    });

    res.json({ success: true, data: result } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// Delete session
commandsRouter.delete("/session/:sessionId", async (req, res, next) => {
  try {
    const { services } = req.app.locals as { services: AppServices };
    const sandboxId = getParam(req, "sandboxId");
    const sessionId = getParam(req, "sessionId");

    const sandbox = await services.sandboxService!.getConnectedSandbox(sandboxId);
    await sandbox.commands.deleteSession(sessionId);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
