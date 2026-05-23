import { request } from "./client";
import type {
  HealthStatus,
  SetupStatus,
  TestConnectionBody,
  TestConnectionResult,
} from "./types";

export function getHealth(): Promise<HealthStatus> {
  return request("GET", "/health");
}

export function getSetupStatus(): Promise<SetupStatus> {
  return request("GET", "/setup/status");
}

export function testConnection(body: TestConnectionBody): Promise<TestConnectionResult> {
  return request("POST", "/setup/test-connection", body);
}

export function setupRemote(body: TestConnectionBody): Promise<{ configured: boolean }> {
  return request("POST", "/setup/remote", body);
}

export function completeSetup(): Promise<{ configured: boolean }> {
  return request("POST", "/setup/complete");
}

/**
 * Open an SSE connection to the local K8s setup stream.
 * Returns a cleanup function to close the connection.
 */
export function streamLocalK8sSetup(
  onProgress: (event: import("./types").SetupProgressEvent) => void,
  onError: (err: Error) => void,
  onDone: () => void,
): () => void {
  const eventSource = new EventSource("/api/setup/local-k8s/stream");

  eventSource.addEventListener("progress", (e) => {
    try {
      const data = JSON.parse(e.data) as import("./types").SetupProgressEvent;
      onProgress(data);
    } catch { /* ignore parse errors */ }
  });

  eventSource.addEventListener("done", () => {
    eventSource.close();
    onDone();
  });

  eventSource.addEventListener("error", (e) => {
    // Try to extract error message from SSE event data
    const message = (e as MessageEvent)?.data
      ? (() => { try { return JSON.parse((e as MessageEvent).data).message; } catch { return "Setup stream error"; } })()
      : "Setup stream error";
    eventSource.close();
    onError(new Error(message));
  });

  // Also handle native EventSource error (connection failed etc.)
  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      onError(new Error("Connection to setup stream lost"));
    }
    eventSource.close();
  };

  return () => {
    eventSource.close();
  };
}
