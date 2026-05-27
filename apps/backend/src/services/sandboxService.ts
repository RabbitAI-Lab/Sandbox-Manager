import { LRUCache } from "lru-cache";
import {
  SandboxManager,
  Sandbox,
  ConnectionConfig,
  type NetworkPolicy,
} from "@alibaba-group/opensandbox";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { ResourceService } from "./resourceService.js";

export class SandboxService {
  private manager: SandboxManager;
  private config: Config;
  private logger: Logger;
  private connectionConfig: ConnectionConfig;
  private resourceService?: ResourceService;

  // LRU cache for connected Sandbox instances
  private cache: LRUCache<string, Sandbox>;

  constructor(config: Config, logger: Logger, resourceService?: ResourceService) {
    this.config = config;
    this.logger = logger;
    this.resourceService = resourceService;
    this.connectionConfig = new ConnectionConfig({
      domain: config.osbServerUrl,
      apiKey: config.osbApiKey || undefined,
      protocol: config.osbProtocol,
      useServerProxy: config.osbUseServerProxy,
      requestTimeoutSeconds: config.osbRequestTimeoutSeconds,
    });

    this.manager = SandboxManager.create({
      connectionConfig: this.connectionConfig,
    });

    this.cache = new LRUCache<string, Sandbox>({
      max: 50,
      ttl: 10 * 60 * 1000, // 10 minutes
      dispose: (sandbox, key) => {
        this.logger.info({ sandboxId: key }, "Evicting sandbox from cache");
        sandbox.close().catch((err) => {
          this.logger.warn({ err, sandboxId: key }, "Failed to close evicted sandbox");
        });
      },
    });

    this.logger.info("SandboxService initialized");
  }

  async listSandboxInfos(filter?: {
    states?: string[];
    metadata?: Record<string, string>;
    page?: number;
    pageSize?: number;
  }) {
    return this.manager.listSandboxInfos(filter);
  }

  async getSandboxInfo(sandboxId: string) {
    return this.manager.getSandboxInfo(sandboxId);
  }

  async createSandbox(opts: {
    image: string;
    name?: string;
    timeoutSeconds?: number;
    env?: Record<string, string>;
    metadata?: Record<string, string>;
    resource?: { cpu?: string; memory?: string };
    networkPolicy?: {
      defaultAction: string;
      egress?: Array<{ action: string; target: string }>;
    };
  }) {
    this.logger.info({ image: opts.image, name: opts.name }, "Creating sandbox");

    // Pre-creation resource check
    if (this.resourceService) {
      const cpu = opts.resource?.cpu ?? "1";
      const memory = opts.resource?.memory ?? "2Gi";
      const check = await this.resourceService.checkSandboxFit({ cpu, memory });
      if (!check.canFit) {
        throw new Error(`Cluster resources exhausted: ${check.reason}`);
      }
    }

    const sandbox = await Sandbox.create({
      connectionConfig: this.connectionConfig,
      image: opts.image,
      timeoutSeconds: opts.timeoutSeconds ?? 600,
      env: opts.env,
      metadata: opts.metadata,
      resource: opts.resource,
      networkPolicy: opts.networkPolicy as NetworkPolicy | undefined,
    });
    // Cache the connected instance
    this.cache.set(sandbox.id, sandbox);
    this.logger.info({ sandboxId: sandbox.id }, "Sandbox created");
    return sandbox.getInfo();
  }

  async killSandbox(sandboxId: string) {
    this.logger.info({ sandboxId }, "Killing sandbox");
    this.cache.delete(sandboxId);
    await this.manager.killSandbox(sandboxId);
  }

  async pauseSandbox(sandboxId: string) {
    this.logger.info({ sandboxId }, "Pausing sandbox");
    this.cache.delete(sandboxId);
    await this.manager.pauseSandbox(sandboxId);
  }

  async resumeSandbox(sandboxId: string) {
    this.logger.info({ sandboxId }, "Resuming sandbox");
    this.cache.delete(sandboxId);
    await this.manager.resumeSandbox(sandboxId);
  }

  /**
   * Get a connected Sandbox instance (from cache or fresh connect).
   * Used for file/command/PTY operations.
   */
  async getConnectedSandbox(sandboxId: string): Promise<Sandbox> {
    let sandbox = this.cache.get(sandboxId);
    if (sandbox) return sandbox;

    this.logger.debug({ sandboxId }, "Connecting to sandbox");
    sandbox = await Sandbox.connect({
      connectionConfig: this.connectionConfig,
      sandboxId,
    });
    this.cache.set(sandboxId, sandbox);
    return sandbox;
  }

  /**
   * Get the execd proxy base URL for a sandbox.
   * Used by PTY relay to construct WebSocket URL.
   */
  async getExecdProxyUrl(sandboxId: string): Promise<{ url: string; headers: Record<string, string> }> {
    const sandbox = await this.getConnectedSandbox(sandboxId);
    const ep = await sandbox.getEndpoint(44772);
    const url = `${this.connectionConfig.protocol}://${ep.endpoint}`;
    const headers: Record<string, string> = {};
    if (ep.headers) {
      Object.assign(headers, ep.headers);
    }
    return { url, headers };
  }

  /**
   * Dispose the service — clear LRU cache and close all cached sandbox connections.
   */
  async dispose(): Promise<void> {
    this.cache.clear();
    this.logger.info("SandboxService disposed");
  }
}
