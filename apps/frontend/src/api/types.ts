export interface Sandbox {
  id: string;
  name?: string;
  image: string;
  status: "Creating" | "Running" | "Paused" | "Error" | "Deleting" | string;
  statusDetail?: {
    state: string;
    reason: string;
    message: string;
    lastTransitionAt: string;
  };
  createdAt?: string;
  expiresAt?: string;
  timeout?: number;
  env?: Record<string, string>;
  metadata?: Record<string, string>;
}

export interface CreateSandboxRequest {
  image: string;
  name?: string;
  timeoutSeconds?: number;
  env?: Record<string, string>;
  metadata?: Record<string, string>;
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modTime?: string;
}

export interface Endpoint {
  url: string;
  scheme: string;
  host: string;
  port: number;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

// Health & Setup types

export interface HealthStatus {
  status: string;
  configured: boolean;
  opensandboxReady: boolean;
  timestamp: string;
  uptime: number;
}

export interface SetupStatus {
  configured: boolean;
  k8sMode?: "local" | "remote";
  osbServerUrl?: string;
}

export interface TestConnectionBody {
  serverUrl: string;
  apiKey: string;
  protocol: "http" | "https";
}

export interface TestConnectionResult {
  connected: boolean;
  error?: string;
}

export interface SetupProgressEvent {
  step: string;
  stepLabel: string;
  status: "running" | "success" | "error";
  output?: string;
  progress: number;
}

// Image Management types

export interface ImageInfo {
  name: string;
  image: string;
  status: "pulling" | "ready" | "error";
  daemonSetName: string;
  createdAt: string;
  nodesReady: number;
  nodesTotal: number;
  message?: string;
}

export interface CachedImage {
  image: string;
  node: string;
  sizeBytes?: number;
}
