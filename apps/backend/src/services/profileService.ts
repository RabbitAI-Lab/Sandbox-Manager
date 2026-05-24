import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import type { Logger } from "../logger.js";

// Server profile data model
export interface ServerProfile {
  id: string;
  name: string;
  serverUrl: string;
  apiKey: string;
  protocol: "http" | "https";
  createdAt: string;
}

// Persistent storage structure for servers.json
export interface ServersConfig {
  profiles: ServerProfile[];
  activeProfileId: string | null;
  allowedDomains: string[];
}

export interface CreateProfileData {
  name: string;
  serverUrl: string;
  apiKey: string;
  protocol: "http" | "https";
}

export interface UpdateProfileData {
  name?: string;
  serverUrl?: string;
  apiKey?: string;
  protocol?: "http" | "https";
}

const MASK_PREFIX = "****";
const MASKED_PLACEHOLDER = "****";

// Mask API key, showing only the last 4 characters
function maskApiKey(key: string): string {
  if (!key || key.length <= 4) return MASKED_PLACEHOLDER;
  return MASK_PREFIX + key.slice(-4);
}

// Apply masking to a profile for API responses
function maskProfile(profile: ServerProfile): ServerProfile {
  return { ...profile, apiKey: maskApiKey(profile.apiKey) };
}

const DEFAULT_CONFIG: ServersConfig = { profiles: [], activeProfileId: null, allowedDomains: [] };

export class ProfileService {
  private logger: Logger;
  private configPath: string;

  constructor(logger: Logger) {
    this.logger = logger;
    this.configPath = path.resolve(process.cwd(), "servers.json");
  }

  // Read and parse servers.json, returning default structure if missing or malformed
  loadServersConfig(): ServersConfig {
    try {
      if (!fs.existsSync(this.configPath)) {
        return { ...DEFAULT_CONFIG };
      }
      const raw = fs.readFileSync(this.configPath, "utf-8");
      const parsed = JSON.parse(raw) as ServersConfig;
      if (!Array.isArray(parsed.profiles) || parsed.activeProfileId === undefined) {
        this.logger.warn("servers.json has invalid structure, using defaults");
        return { ...DEFAULT_CONFIG };
      }
      return { ...parsed, allowedDomains: parsed.allowedDomains ?? [] };
    } catch (err) {
      this.logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Failed to load servers.json");
      return { ...DEFAULT_CONFIG };
    }
  }

  // Atomic write: write to temp file then rename for crash safety
  saveServersConfig(config: ServersConfig): void {
    const tmpPath = this.configPath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2) + os.EOL, "utf-8");
    fs.renameSync(tmpPath, this.configPath);
  }

  // List all profiles with masked API keys
  listProfiles(): ServerProfile[] {
    const config = this.loadServersConfig();
    return config.profiles.map(maskProfile);
  }

  // Get a single profile by ID with masked API key
  getProfile(id: string): ServerProfile | null {
    const config = this.loadServersConfig();
    const profile = config.profiles.find((p) => p.id === id);
    return profile ? maskProfile(profile) : null;
  }

  // Get a profile with the full (unmasked) API key — internal use only
  getFullProfile(id: string): ServerProfile | null {
    const config = this.loadServersConfig();
    return config.profiles.find((p) => p.id === id) ?? null;
  }

  // Create a new server profile
  createProfile(data: CreateProfileData): ServerProfile {
    const config = this.loadServersConfig();
    const profile: ServerProfile = {
      id: randomUUID(),
      name: data.name,
      serverUrl: data.serverUrl,
      apiKey: data.apiKey,
      protocol: data.protocol,
      createdAt: new Date().toISOString(),
    };
    config.profiles.push(profile);
    this.saveServersConfig(config);
    this.logger.info({ id: profile.id, name: profile.name }, "Profile created");
    return maskProfile(profile);
  }

  // Update an existing profile. If apiKey is the masked placeholder, keep the original.
  updateProfile(id: string, data: UpdateProfileData): ServerProfile | null {
    const config = this.loadServersConfig();
    const idx = config.profiles.findIndex((p) => p.id === id);
    if (idx === -1) return null;

    const existing = config.profiles[idx];
    const updated: ServerProfile = {
      ...existing,
      name: data.name ?? existing.name,
      serverUrl: data.serverUrl ?? existing.serverUrl,
      // Preserve original key if the client sends the masked placeholder
      apiKey: data.apiKey && data.apiKey !== MASKED_PLACEHOLDER && !data.apiKey.startsWith(MASK_PREFIX)
        ? data.apiKey
        : existing.apiKey,
      protocol: data.protocol ?? existing.protocol,
    };
    config.profiles[idx] = updated;
    this.saveServersConfig(config);
    this.logger.info({ id, name: updated.name }, "Profile updated");
    return maskProfile(updated);
  }

  // Delete a profile. If it was the active profile, clear activeProfileId.
  // Returns false if profile not found or if it is the last remaining profile.
  deleteProfile(id: string): boolean {
    const config = this.loadServersConfig();
    if (config.profiles.length <= 1) return false;
    const idx = config.profiles.findIndex((p) => p.id === id);
    if (idx === -1) return false;

    config.profiles.splice(idx, 1);
    if (config.activeProfileId === id) {
      config.activeProfileId = null;
    }
    this.saveServersConfig(config);
    this.logger.info({ id }, "Profile deleted");
    return true;
  }

  // Set the active profile ID in servers.json
  setActiveProfileId(id: string | null): void {
    const config = this.loadServersConfig();
    config.activeProfileId = id;
    this.saveServersConfig(config);
  }

  // Get the currently active profile ID
  getActiveProfileId(): string | null {
    return this.loadServersConfig().activeProfileId;
  }

  // Sync from the current runtime Config (loaded from .env) into servers.json.
  // If no profile matches the current config, create one and set it active.
  // This handles the case where a user configured via .env before servers.json existed.
  syncFromConfig(config: { osbServerUrl: string; osbApiKey: string; osbProtocol: string; configured: boolean }): void {
    if (!config.configured) return;

    const serversConfig = this.loadServersConfig();
    const existing = serversConfig.profiles.find((p) => p.serverUrl === config.osbServerUrl);

    if (existing) {
      // Update existing profile and set as active
      existing.apiKey = config.osbApiKey;
      existing.protocol = config.osbProtocol as "http" | "https";
      serversConfig.activeProfileId = existing.id;
      this.saveServersConfig(serversConfig);
      return;
    }

    // No matching profile — create one
    const isLocal = config.osbServerUrl.includes("localhost") || config.osbServerUrl.includes("127.0.0.1");
    const profile: ServerProfile = {
      id: randomUUID(),
      name: isLocal ? "Local Kubernetes" : "Remote Server",
      serverUrl: config.osbServerUrl,
      apiKey: config.osbApiKey,
      protocol: config.osbProtocol as "http" | "https",
      createdAt: new Date().toISOString(),
    };
    serversConfig.profiles.push(profile);
    serversConfig.activeProfileId = profile.id;
    this.saveServersConfig(serversConfig);
    this.logger.info({ id: profile.id, name: profile.name }, "Profile auto-created from existing .env config");
  }

  // Ensure a profile exists for the given server config.
  // If a profile with matching serverUrl is found, update it and set active.
  // Otherwise, create a new profile and set it as active.
  // This is used by the setup wizard to sync config into servers.json.
  ensureProfile(data: { name: string; serverUrl: string; apiKey: string; protocol: "http" | "https" }): ServerProfile {
    const config = this.loadServersConfig();
    const existing = config.profiles.find((p) => p.serverUrl === data.serverUrl);

    if (existing) {
      existing.name = data.name;
      existing.apiKey = data.apiKey;
      existing.protocol = data.protocol;
      config.activeProfileId = existing.id;
      this.saveServersConfig(config);
      this.logger.info({ id: existing.id, name: existing.name }, "Existing profile updated during setup sync");
      return maskProfile(existing);
    }

    const profile: ServerProfile = {
      id: randomUUID(),
      name: data.name,
      serverUrl: data.serverUrl,
      apiKey: data.apiKey,
      protocol: data.protocol,
      createdAt: new Date().toISOString(),
    };
    config.profiles.push(profile);
    config.activeProfileId = profile.id;
    this.saveServersConfig(config);
    this.logger.info({ id: profile.id, name: profile.name }, "Profile created during setup sync");
    return maskProfile(profile);
  }
}
