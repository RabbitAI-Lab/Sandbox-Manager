import WebSocket, { type WebSocketServer } from "ws";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { SandboxService } from "../services/sandboxService.js";
import type { ConnectionManager } from "./connectionManager.js";

/**
 * PTY Relay — the most critical backend component.
 *
 * Data path:
 *   xterm.js ↔ WS(frontend↔backend) ↔ ptyRelay ↔ WS(backend↔OSB Server Proxy) ↔ execd
 *
 * The relay is transparent — it forwards raw binary frames in both directions.
 * Binary protocol:
 *   0x00 + UTF-8 bytes = stdin (client→execd)
 *   0x01 + bytes = stdout (execd→client)
 *   0x02 + bytes = stderr (execd→client)
 * JSON text frames for control: {"type":"resize","cols":N,"rows":N} and {"type":"exit","code":N}
 */
export class PtyRelay {
  private sandboxService: SandboxService | null;
  private connectionManager: ConnectionManager;
  private config: Config;
  private logger: Logger;

  constructor(
    sandboxService: SandboxService | null,
    connectionManager: ConnectionManager,
    config: Config,
    logger: Logger,
  ) {
    this.sandboxService = sandboxService;
    this.connectionManager = connectionManager;
    this.config = config;
    this.logger = logger;
  }

  async handleUpgrade(
    wss: WebSocketServer,
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    sandboxId: string,
  ) {
    let connectionId: string | undefined;

    try {
      if (!this.sandboxService) {
        throw new Error("OpenSandbox not configured");
      }

      // Step 1: Complete the frontend WebSocket handshake
      const conn = this.connectionManager.add(null as unknown as WebSocket, sandboxId);
      connectionId = conn.connectionId;

      await new Promise<void>((resolve, reject) => {
        wss.handleUpgrade(req, socket, head, (ws) => {
          conn.frontendWs = ws;
          wss.emit("connection", ws, req);
          resolve();
        });
        // Timeout for handshake
        setTimeout(() => reject(new Error("WebSocket handshake timeout")), 10000);
      });

      this.logger.info({ connectionId, sandboxId }, "Frontend WebSocket connected");

      // Step 2: Resolve execd proxy URL
      const { url: execdUrl, headers: execdHeaders } = await this.sandboxService.getExecdProxyUrl(sandboxId);
      this.logger.debug({ connectionId, execdUrl, execdHeaders }, "Resolved execd proxy URL");

      // Step 3: Create PTY session via HTTP POST
      const baseUrl = execdUrl.replace(/\/$/, "");
      const createSessionUrl = `${baseUrl}/pty`;

      const sessionResponse = await fetch(createSessionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...execdHeaders,
        },
        body: JSON.stringify({ cols: 80, rows: 24 }),
      });

      if (!sessionResponse.ok) {
        throw new Error(`PTY session creation failed: ${sessionResponse.status} ${await sessionResponse.text()}`);
      }

      const sessionData = (await sessionResponse.json()) as { session_id: string };
      conn.sessionId = sessionData.session_id;
      this.logger.info({ connectionId, sessionId: conn.sessionId }, "PTY session created");

      // Step 4: Open backend-to-server WebSocket
      // Connect directly to the execd endpoint (gateway) with routing headers
      const wsProtocol = this.config.osbProtocol === "https" ? "wss" : "ws";
      const wsUrl = `${wsProtocol}://${execdUrl.replace(/^https?:\/\//, "")}/pty/${conn.sessionId}/ws`;

      const serverWs = new WebSocket(wsUrl, {
        headers: {
          ...(this.config.osbApiKey ? { "OPEN-SANDBOX-API-KEY": this.config.osbApiKey } : {}),
          ...execdHeaders,
        },
      });
      conn.serverWs = serverWs;

      // Step 5: Bidirectional relay
      this.setupRelay(conn);
    } catch (err) {
      this.logger.error({ err, sandboxId, connectionId }, "PTY relay setup failed");
      if (connectionId) {
        this.connectionManager.remove(connectionId);
      } else {
        socket.destroy();
      }
    }
  }

  private setupRelay(conn: import("./types.js").ActivePtyConnection) {
    const { frontendWs, serverWs } = conn;
    if (!serverWs) return;

    // Frontend → Server (stdin binary frames + JSON resize)
    frontendWs.on("message", (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (serverWs.readyState === WebSocket.OPEN) {
        serverWs.send(data as Buffer, { binary: isBinary });
        this.connectionManager.updateActivity(conn.connectionId);
      }
    });

    // Server → Frontend (stdout/stderr binary frames + JSON exit)
    serverWs.on("message", (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      if (frontendWs.readyState === WebSocket.OPEN) {
        this.logger.debug({
          connectionId: conn.connectionId,
          isBinary,
          dataLen: Buffer.isBuffer(data) ? data.length : 0,
          preview: Buffer.isBuffer(data) ? data.slice(0, 50).toString("utf-8") : "(non-buffer)",
        }, "Server→Frontend relay");
        frontendWs.send(data as Buffer, { binary: isBinary });
        this.connectionManager.updateActivity(conn.connectionId);
      }
    });

    // Handle close events — close the other side
    frontendWs.on("close", (code, reason) => {
      this.logger.info({ connectionId: conn.connectionId, code, reason: reason.toString() }, "Frontend WebSocket closed");
      this.connectionManager.remove(conn.connectionId);
    });

    serverWs.on("close", (code, reason) => {
      this.logger.info({ connectionId: conn.connectionId, code, reason: reason.toString() }, "Server WebSocket closed");
      this.connectionManager.remove(conn.connectionId);
    });

    // Handle errors
    frontendWs.on("error", (err) => {
      this.logger.error({ err, connectionId: conn.connectionId }, "Frontend WebSocket error");
      this.connectionManager.remove(conn.connectionId);
    });

    serverWs.on("error", (err) => {
      this.logger.error({ err, connectionId: conn.connectionId }, "Server WebSocket error");
      this.connectionManager.remove(conn.connectionId);
    });

    this.logger.info({ connectionId: conn.connectionId }, "PTY relay active");
  }
}
