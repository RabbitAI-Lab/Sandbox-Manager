import type WebSocket from "ws";
import type { IncomingMessage } from "http";

export interface PtyControlMessage {
  type: "resize" | "exit";
  cols?: number;
  rows?: number;
  code?: number;
}

export interface ActivePtyConnection {
  connectionId: string;
  sandboxId: string;
  frontendWs: WebSocket;
  serverWs: WebSocket | null;
  sessionId: string | null;
  createdAt: number;
  lastActivityAt: number;
}
