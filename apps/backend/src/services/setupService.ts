import fs from "node:fs";
import path from "node:path";
import { SandboxManager, ConnectionConfig } from "@alibaba-group/opensandbox";
import type { Logger } from "../logger.js";

export interface SetupStatus {
  configured: boolean;
  k8sMode?: "local" | "remote";
  osbServerUrl?: string;
}

export interface RemoteSetupBody {
  serverUrl: string;
  apiKey: string;
  protocol: "http" | "https";
}

export interface TestConnectionResult {
  connected: boolean;
  error?: string;
}

/**
 * Write env key-value pairs into the backend .env file.
 * Preserves existing content, updates only matching keys or appends new ones.
 */
function writeEnvFile(envPath: string, entries: Record<string, string>): void {
  let lines: string[] = [];

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    lines = content.split("\n");
  }

  const keySet = new Set(Object.keys(entries));

  // Update existing lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#") || line.length === 0) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    if (keySet.has(key)) {
      lines[i] = `${key}=${entries[key]}`;
      keySet.delete(key);
    }
  }

  // Append new keys
  for (const key of keySet) {
    lines.push(`${key}=${entries[key]}`);
  }

  fs.writeFileSync(envPath, lines.join("\n") + "\n", "utf-8");
}

export class SetupService {
  private logger: Logger;
  private envPath: string;

  constructor(logger: Logger) {
    this.logger = logger;
    // Resolve .env relative to backend package root
    this.envPath = path.resolve(process.cwd(), ".env");
  }

  /**
   * Get current setup status from the running config.
   */
  getSetupStatus(config: { configured: boolean; osbServerUrl: string; osbApiKey: string }): SetupStatus {
    if (!config.configured) {
      return { configured: false };
    }
    return {
      configured: true,
      k8sMode: config.osbServerUrl.includes("localhost") || config.osbServerUrl.includes("127.0.0.1") ? "local" : "remote",
      osbServerUrl: config.osbServerUrl,
    };
  }

  /**
   * Test connectivity to a remote OpenSandbox instance.
   */
  async testConnection(body: RemoteSetupBody): Promise<TestConnectionResult> {
    try {
      const connectionConfig = new ConnectionConfig({
        domain: body.serverUrl,
        apiKey: body.apiKey || undefined,
        protocol: body.protocol,
        requestTimeoutSeconds: 10,
      });

      const manager = SandboxManager.create({ connectionConfig });
      await manager.listSandboxInfos({ page: 1, pageSize: 1 });

      return { connected: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn({ err: message }, "Test connection failed");
      return { connected: false, error: message };
    }
  }

  /**
   * Save remote OpenSandbox config to .env file.
   */
  async saveRemoteConfig(body: RemoteSetupBody): Promise<void> {
    this.logger.info({ serverUrl: body.serverUrl }, "Saving remote config");

    writeEnvFile(this.envPath, {
      OPENSANDBOX_SERVER_URL: body.serverUrl,
      OPENSANDBOX_API_KEY: body.apiKey,
      OPENSANDBOX_PROTOCOL: body.protocol,
    });

    // Update process.env so loadConfig() picks up new values
    process.env.OPENSANDBOX_SERVER_URL = body.serverUrl;
    process.env.OPENSANDBOX_API_KEY = body.apiKey;
    process.env.OPENSANDBOX_PROTOCOL = body.protocol;

    this.logger.info("Remote config saved to .env");
  }

  /**
   * Save local K8s default config to .env file.
   */
  async saveLocalConfig(): Promise<void> {
    this.logger.info("Saving local K8s config");

    writeEnvFile(this.envPath, {
      OPENSANDBOX_SERVER_URL: "osb.sandbox.localhost",
      OPENSANDBOX_API_KEY: "dev-api-key-change-in-prod",
      OPENSANDBOX_PROTOCOL: "http",
      OPENSANDBOX_USE_SERVER_PROXY: "false",
    });

    // Update process.env
    process.env.OPENSANDBOX_SERVER_URL = "osb.sandbox.localhost";
    process.env.OPENSANDBOX_API_KEY = "dev-api-key-change-in-prod";
    process.env.OPENSANDBOX_PROTOCOL = "http";
    process.env.OPENSANDBOX_USE_SERVER_PROXY = "false";

    this.logger.info("Local K8s config saved to .env");
  }
}
