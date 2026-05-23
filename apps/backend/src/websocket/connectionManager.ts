import type WebSocket from "ws";
import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { ActivePtyConnection } from "./types.js";

export class ConnectionManager {
  private connections = new Map<string, ActivePtyConnection>();
  private config: Config;
  private logger: Logger;
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Config, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  startIdleMonitor() {
    if (this.idleCheckInterval) return;
    this.idleCheckInterval = setInterval(() => this.checkIdleConnections(), 60000);
  }

  stopIdleMonitor() {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
  }

  add(frontendWs: WebSocket, sandboxId: string): ActivePtyConnection {
    const connectionId = randomUUID();
    const now = Date.now();
    const conn: ActivePtyConnection = {
      connectionId,
      sandboxId,
      frontendWs,
      serverWs: null,
      sessionId: null,
      createdAt: now,
      lastActivityAt: now,
    };
    this.connections.set(connectionId, conn);
    this.logger.info({ connectionId, sandboxId, total: this.connections.size }, "Connection added");
    this.startIdleMonitor();
    return conn;
  }

  remove(connectionId: string) {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    // Close both WebSockets
    try {
      if (conn.frontendWs.readyState <= 1) conn.frontendWs.close(1000, "cleanup");
    } catch { /* ignore */ }
    try {
      if (conn.serverWs && conn.serverWs.readyState <= 1) conn.serverWs.close(1000, "cleanup");
    } catch { /* ignore */ }

    this.connections.delete(connectionId);
    this.logger.info({ connectionId, sandboxId: conn.sandboxId, total: this.connections.size }, "Connection removed");

    if (this.connections.size === 0) {
      this.stopIdleMonitor();
    }
  }

  get(connectionId: string): ActivePtyConnection | undefined {
    return this.connections.get(connectionId);
  }

  getBySandbox(sandboxId: string): ActivePtyConnection[] {
    const result: ActivePtyConnection[] = [];
    for (const conn of this.connections.values()) {
      if (conn.sandboxId === sandboxId) result.push(conn);
    }
    return result;
  }

  updateActivity(connectionId: string) {
    const conn = this.connections.get(connectionId);
    if (conn) conn.lastActivityAt = Date.now();
  }

  closeAll() {
    this.logger.info({ count: this.connections.size }, "Closing all connections");
    for (const [id] of this.connections) {
      this.remove(id);
    }
  }

  private checkIdleConnections() {
    const now = Date.now();
    for (const [id, conn] of this.connections) {
      if (now - conn.lastActivityAt > this.config.ptyIdleTimeoutMs) {
        this.logger.info({ connectionId: id, sandboxId: conn.sandboxId }, "Closing idle connection");
        this.remove(id);
      }
    }
  }
}
