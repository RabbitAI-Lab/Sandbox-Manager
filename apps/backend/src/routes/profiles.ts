import { Router, type Request, type Response } from "express";
import { ProfileService } from "../services/profileService.js";
import { SetupService } from "../services/setupService.js";
import { loadConfig } from "../config.js";
import { reinitializeServices } from "../server.js";
import type { AppLocals } from "../server.js";

export const profilesRouter = Router();

// Guard: only one switch operation at a time
let switchInProgress = false;

function getAppLocals(req: Request) {
  return req.app.locals as AppLocals;
}

// GET /api/profiles — List all profiles (keys masked)
profilesRouter.get("/", (req, res) => {
  const { config, logger } = getAppLocals(req);
  const profileService = new ProfileService(logger);
  // Ensure the current .env config is reflected in servers.json
  // This handles legacy setups where config was saved to .env before servers.json existed
  profileService.syncFromConfig(config);
  const profiles = profileService.listProfiles();
  const activeProfileId = profileService.getActiveProfileId();
  res.json({ success: true, data: { profiles, activeProfileId } });
});

// POST /api/profiles — Create a new profile
profilesRouter.post("/", (req, res) => {
  const { logger } = getAppLocals(req);
  const profileService = new ProfileService(logger);

  const { name, serverUrl, apiKey, protocol } = req.body;
  if (!name || !serverUrl || !apiKey) {
    res.status(400).json({ success: false, error: { code: "MISSING_FIELD", message: "name, serverUrl, and apiKey are required" } });
    return;
  }

  const profile = profileService.createProfile({
    name,
    serverUrl,
    apiKey,
    protocol: protocol ?? "http",
  });

  res.status(201).json({ success: true, data: profile });
});

// PUT /api/profiles/:id — Update a profile
profilesRouter.put("/:id", (req, res) => {
  const { logger } = getAppLocals(req);
  const profileService = new ProfileService(logger);

  const { id } = req.params;
  const { name, serverUrl, apiKey, protocol } = req.body;

  const updated = profileService.updateProfile(id, {
    name,
    serverUrl,
    apiKey,
    protocol,
  });

  if (!updated) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Profile not found" } });
    return;
  }

  res.json({ success: true, data: updated });
});

// DELETE /api/profiles/:id — Delete a profile
profilesRouter.delete("/:id", (req, res) => {
  const { logger } = getAppLocals(req);
  const profileService = new ProfileService(logger);

  const { id } = req.params;
  const deleted = profileService.deleteProfile(id);

  if (!deleted) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Profile not found" } });
    return;
  }

  res.json({ success: true, data: null });
});

// POST /api/profiles/:id/switch — Switch active server to this profile
profilesRouter.post("/:id/switch", async (req, res) => {
  if (switchInProgress) {
    res.status(409).json({ success: false, error: { code: "SWITCH_IN_PROGRESS", message: "A server switch is already in progress" } });
    return;
  }

  const app = req.app;
  const { logger, services } = getAppLocals(req);
  const profileService = new ProfileService(logger);
  const setupService = new SetupService(logger);

  const { id } = req.params;

  // Load the full (unmasked) profile
  const profile = profileService.getFullProfile(id);
  if (!profile) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Profile not found" } });
    return;
  }

  switchInProgress = true;

  try {
    // Write profile credentials to .env and process.env
    await setupService.saveRemoteConfig({
      serverUrl: profile.serverUrl,
      apiKey: profile.apiKey,
      protocol: profile.protocol,
    });

    // Reload config from updated env vars
    const newConfig = loadConfig();

    // Hot-reload all backend services
    await reinitializeServices(app, newConfig, logger);

    // Close all active PTY WebSocket connections
    services.connectionManager.closeAll();

    // Mark this profile as active in servers.json
    profileService.setActiveProfileId(id);

    logger.info({ profileId: id, profileName: profile.name }, "Switched active server profile");

    res.json({ success: true, data: { configured: true } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, profileId: id }, "Failed to switch server profile");
    res.status(500).json({ success: false, error: { code: "SWITCH_FAILED", message } });
  } finally {
    switchInProgress = false;
  }
});

// POST /api/profiles/:id/test — Test connection for a saved profile
profilesRouter.post("/:id/test", async (req, res) => {
  const { logger } = getAppLocals(req);
  const profileService = new ProfileService(logger);
  const setupService = new SetupService(logger);

  const { id } = req.params;
  const profile = profileService.getFullProfile(id);
  if (!profile) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Profile not found" } });
    return;
  }

  const result = await setupService.testConnection({
    serverUrl: profile.serverUrl,
    apiKey: profile.apiKey,
    protocol: profile.protocol,
  });

  res.json({ success: true, data: result });
});
