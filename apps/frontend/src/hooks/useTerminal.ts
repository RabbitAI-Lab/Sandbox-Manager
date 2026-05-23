import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface UseTerminalOptions {
  sandboxId: string;
  sessionId: string;
}

export function useTerminal({ sandboxId, sessionId }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const reconnectAttemptRef = useRef(0);
  const disposedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (disposedRef.current) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/sandboxes/${sandboxId}/pty`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      if (disposedRef.current) return;
      reconnectAttemptRef.current = 0;
      setConnected(true);
      setReconnecting(false);
      setError(null);

      // Fit terminal after connect
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    ws.onmessage = (event: MessageEvent) => {
      if (!terminalRef.current || disposedRef.current) return;

      if (event.data instanceof ArrayBuffer) {
        const view = new Uint8Array(event.data);
        if (view.length === 0) return;
        const type = view[0];
        const payload = view.slice(1);
        const decoder = new TextDecoder();

        if (type === 0x01 || type === 0x02) {
          terminalRef.current.write(decoder.decode(payload));
        }
        return;
      }

      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "exit") {
            terminalRef.current.write(
              `\r\n\x1b[90m[Process exited with code ${msg.code}]\x1b[0m\r\n`,
            );
            setConnected(false);
          }
        } catch {
          terminalRef.current.write(event.data);
        }
      }
    };

    ws.onclose = (event) => {
      if (disposedRef.current) return;
      setConnected(false);

      if (event.code === 1000) return; // normal close

      setReconnecting(true);
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      reconnectAttemptRef.current++;
      reconnectTimerRef.current = setTimeout(connect, jitter);
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
    };
  }, [sandboxId]);

  useEffect(() => {
    if (!containerRef.current) return;
    disposedRef.current = false;

    // Create terminal
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
      scrollback: 5000,
      convertEol: true,
      theme: {
        background: "#1e1e2e",
        foreground: "#cdd6f4",
        cursor: "#f5e0dc",
        selectionBackground: "#585b7066",
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(containerRef.current);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    requestAnimationFrame(() => fitAddon.fit());

    // Terminal input → WebSocket (stdin: 0x00 + UTF-8)
    const dataDisposable = terminal.onData((data: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        const encoder = new TextEncoder();
        const payload = encoder.encode(data);
        const frame = new Uint8Array(1 + payload.length);
        frame[0] = 0x00;
        frame.set(payload, 1);
        wsRef.current.send(frame.buffer);
      }
    });

    // Terminal resize → JSON resize frame
    const resizeDisposable = terminal.onResize(({ cols, rows }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    // Container resize → fit terminal
    const observer = new ResizeObserver(() => {
      if (!disposedRef.current) fitAddon.fit();
    });
    observer.observe(containerRef.current);

    // Connect WebSocket
    connect();

    // Cleanup
    return () => {
      disposedRef.current = true;

      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close(1000, "unmount");
        wsRef.current = null;
      }

      observer.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      webLinksAddon.dispose();
      terminal.dispose();

      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sandboxId, sessionId, connect]);

  return { containerRef, connected, reconnecting, error };
}
