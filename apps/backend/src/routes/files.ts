import { Router } from "express";
import type { Request } from "express";
import type { Sandbox } from "@alibaba-group/opensandbox";
import type { AppServices } from "../server.js";
import type { SandboxService } from "../services/sandboxService.js";
import type { ApiResponse, WriteFileBody, MkdirBody, MoveFilesBody } from "../types/index.js";

export const filesRouter = Router({ mergeParams: true });

function getParam(req: Request, name: string): string {
  return (req.params as Record<string, string>)[name];
}

function getSandboxService(req: Request): SandboxService {
  const { services } = req.app.locals as { services: AppServices };
  return services.sandboxService!;
}

// List directory contents
filesRouter.get("/", async (req, res, next) => {
  try {
    const sandboxId = getParam(req, "sandboxId");
    const dirPath = (req.query.path as string) || "/";
    const { logger } = req.app.locals as { logger: import("pino").Logger };

    const sandbox = await getSandboxService(req).getConnectedSandbox(sandboxId);

    let entries: Array<{ name: string; path: string; isDir: boolean; size: number; modTime?: string }>;

    try {
      entries = await listViaSearch(sandbox, dirPath);
    } catch (searchErr) {
      logger.warn(
        { err: searchErr, dirPath, sandboxId },
        "File search failed, falling back to ls+stat",
      );
      entries = await listViaLsStat(sandbox, dirPath, logger);
    }

    res.json({ success: true, data: entries } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// Read file content
filesRouter.get("/content", async (req, res, next) => {
  try {
    const { services } = req.app.locals as { services: AppServices };
    const sandboxId = getParam(req, "sandboxId");
    const path = req.query.path as string;

    if (!path) {
      res.status(400).json({ success: false, error: { code: "MISSING_PATH", message: "path query parameter is required" } });
      return;
    }

    const sandbox = await services.sandboxService!.getConnectedSandbox(sandboxId);
    if (await isDirectory(sandbox, path)) {
      res.status(400).json({ success: false, error: { code: "IS_DIRECTORY", message: "path is a directory, not a file" } });
      return;
    }
    const content = await sandbox.files.readFile(path);

    res.type("text/plain").send(content);
  } catch (err) {
    next(err);
  }
});

// Read file as binary
filesRouter.get("/download", async (req, res, next) => {
  try {
    const { services } = req.app.locals as { services: AppServices };
    const sandboxId = getParam(req, "sandboxId");
    const path = req.query.path as string;

    if (!path) {
      res.status(400).json({ success: false, error: { code: "MISSING_PATH", message: "path query parameter is required" } });
      return;
    }

    const sandbox = await services.sandboxService!.getConnectedSandbox(sandboxId);
    if (await isDirectory(sandbox, path)) {
      res.status(400).json({ success: false, error: { code: "IS_DIRECTORY", message: "path is a directory, not a file" } });
      return;
    }
    const bytes = await sandbox.files.readBytes(path);

    res.type("application/octet-stream").send(Buffer.from(bytes));
  } catch (err) {
    next(err);
  }
});

// Write file
filesRouter.post("/write", async (req, res, next) => {
  try {
    const { services } = req.app.locals as { services: AppServices };
    const sandboxId = getParam(req, "sandboxId");
    const { path, content, mode } = req.body as WriteFileBody;

    if (!path || content === undefined) {
      res.status(400).json({ success: false, error: { code: "MISSING_FIELDS", message: "path and content are required" } });
      return;
    }

    const sandbox = await services.sandboxService!.getConnectedSandbox(sandboxId);
    await sandbox.files.writeFiles([{ path, data: content, mode }]);

    res.json({ success: true } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// Create directory
filesRouter.post("/mkdir", async (req, res, next) => {
  try {
    const { services } = req.app.locals as { services: AppServices };
    const sandboxId = getParam(req, "sandboxId");
    const { paths, mode } = req.body as MkdirBody;

    if (!paths?.length) {
      res.status(400).json({ success: false, error: { code: "MISSING_PATHS", message: "paths array is required" } });
      return;
    }

    const sandbox = await services.sandboxService!.getConnectedSandbox(sandboxId);
    await sandbox.files.createDirectories(paths.map((p) => ({ path: p, mode })));

    res.json({ success: true } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// Move/rename files
filesRouter.post("/move", async (req, res, next) => {
  try {
    const { services } = req.app.locals as { services: AppServices };
    const sandboxId = getParam(req, "sandboxId");
    const { entries } = req.body as MoveFilesBody;

    if (!entries?.length) {
      res.status(400).json({ success: false, error: { code: "MISSING_ENTRIES", message: "entries array is required" } });
      return;
    }

    const sandbox = await services.sandboxService!.getConnectedSandbox(sandboxId);
    await sandbox.files.moveFiles(entries);

    res.json({ success: true } as ApiResponse);
  } catch (err) {
    next(err);
  }
});

// Delete files
filesRouter.delete("/files", async (req, res, next) => {
  try {
    const { services } = req.app.locals as { services: AppServices };
    const sandboxId = getParam(req, "sandboxId");
    const paths = req.query.path
      ? Array.isArray(req.query.path)
        ? req.query.path as string[]
        : [req.query.path as string]
      : [];

    if (!paths.length) {
      res.status(400).json({ success: false, error: { code: "MISSING_PATH", message: "path query parameter is required" } });
      return;
    }

    const sandbox = await services.sandboxService!.getConnectedSandbox(sandboxId);
    await sandbox.files.deleteFiles(paths);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Delete directories
filesRouter.delete("/directories", async (req, res, next) => {
  try {
    const { services } = req.app.locals as { services: AppServices };
    const sandboxId = getParam(req, "sandboxId");
    const paths = req.query.path
      ? Array.isArray(req.query.path)
        ? req.query.path as string[]
        : [req.query.path as string]
      : [];

    if (!paths.length) {
      res.status(400).json({ success: false, error: { code: "MISSING_PATH", message: "path query parameter is required" } });
      return;
    }

    const sandbox = await services.sandboxService!.getConnectedSandbox(sandboxId);
    await sandbox.files.deleteDirectories(paths);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * List direct children via SDK search API.
 * search is recursive, so we filter results to only direct children.
 */
async function listViaSearch(
  sandbox: Sandbox,
  dirPath: string,
): Promise<Array<{ name: string; path: string; isDir: boolean; size: number; modTime?: string }>> {
  const rawEntries = await sandbox.files.search({ path: dirPath, pattern: "*" });
  const prefix = dirPath === "/" ? "/" : dirPath + "/";

  // Build a set of all directory paths (inferred from deeper paths)
  const dirPathSet = new Set<string>();
  for (const entry of rawEntries) {
    let lastSlash = entry.path.lastIndexOf("/");
    while (lastSlash > 0) {
      dirPathSet.add(entry.path.substring(0, lastSlash));
      lastSlash = entry.path.lastIndexOf("/", lastSlash - 1);
    }
  }

  // First pass: direct children from search results
  const seenPaths = new Set<string>();
  const entries: Array<{ name: string; path: string; isDir: boolean; size: number; modTime?: string }> = [];

  for (const entry of rawEntries) {
    const p = entry.path;
    if (!p.startsWith(prefix)) continue;
    const relative = p.slice(prefix.length);
    if (!relative || relative.includes("/")) continue;

    seenPaths.add(p);
    entries.push({
      name: relative,
      path: p,
      isDir: dirPathSet.has(p),
      size: entry.size ?? 0,
      modTime: entry.modifiedAt instanceof Date
        ? entry.modifiedAt.toISOString()
        : entry.modifiedAt as string | undefined,
    });
  }

  // Second pass: inferred directories from deeper paths
  for (const entry of rawEntries) {
    const p = entry.path;
    if (!p.startsWith(prefix)) continue;
    const relative = p.slice(prefix.length);
    const firstSlash = relative.indexOf("/");
    if (firstSlash <= 0) continue;

    const childName = relative.substring(0, firstSlash);
    const childPath = prefix + childName;
    if (seenPaths.has(childPath)) continue;

    seenPaths.add(childPath);
    entries.push({
      name: childName,
      path: childPath,
      isDir: true,
      size: 0,
      modTime: undefined,
    });
  }

  return entries;
}

/**
 * Fallback: list direct children via `ls` command.
 * Uses `ls -1ap` to append '/' to directory names for reliable isDir detection.
 */
async function listViaLsStat(
  sandbox: Sandbox,
  dirPath: string,
  logger: import("pino").Logger,
): Promise<Array<{ name: string; path: string; isDir: boolean; size: number; modTime?: string }>> {
  const escapedPath = dirPath === "/" ? "/" : `'${dirPath.replace(/'/g, "'\\''")}'`;
  const lsResult = await sandbox.commands.run(`ls -1Ap ${escapedPath} 2>/dev/null | head -500`);
  logger.debug({ lsResult: JSON.stringify(lsResult) }, "ls raw result");
  const lsOut = extractStdout(lsResult);
  logger.debug({ lsOut, dirPath }, "ls parsed output");

  const prefix = dirPath === "/" ? "/" : dirPath + "/";
  const entries: Array<{ name: string; path: string; isDir: boolean; size: number; modTime?: string }> = [];

  for (const line of lsOut.split("\n")) {
    if (!line) continue;

    const isDir = line.endsWith("/");
    // Strip trailing '/' added by -p so name is clean
    const name = isDir ? line.slice(0, -1) : line;
    if (!name) continue;

    entries.push({
      name,
      path: prefix + name,
      isDir,
      size: 0,
      modTime: undefined,
    });
  }

  return entries;
}

/** Extract stdout text from an Execution result returned by sandbox.commands.run */
function extractStdout(execution: unknown): string {
  const exec = execution as { logs?: { stdout?: Array<{ text?: string }> } };
  return exec?.logs?.stdout?.map((m) => m.text ?? "").join("\n") ?? "";
}

/** Check if path is a directory via `test -d` command */
async function isDirectory(sandbox: Sandbox, path: string): Promise<boolean> {
  const escaped = `'${path.replace(/'/g, "'\\''")}'`;
  const result = await sandbox.commands.run(`test -d ${escaped}`);
  return (result as { exitCode?: number | null }).exitCode === 0;
}
