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
  resource?: { cpu?: string; memory?: string };
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

// Server Profile types

export interface ServerProfile {
  id: string;
  name: string;
  serverUrl: string;
  apiKey: string;
  protocol: "http" | "https";
  createdAt: string;
}

export interface CreateProfileBody {
  name: string;
  serverUrl: string;
  apiKey: string;
  protocol: "http" | "https";
}

export interface UpdateProfileBody {
  name?: string;
  serverUrl?: string;
  apiKey?: string;
  protocol?: "http" | "https";
}

export interface CheckItem {
  id: string;
  name: string;
  description: string;
  status: "checking" | "passed" | "failed" | "installing";
  message?: string;
  installable?: boolean;
  configurable?: boolean;
  manualCommand?: string;
}

export interface ProfilesListResponse {
  profiles: ServerProfile[];
  activeProfileId: string | null;
}

// Cluster resource monitoring

export interface NodeResource {
  name: string;
  cpuAllocatable: string;
  memoryAllocatable: string;
  sandboxCpuRequested?: string;
  sandboxMemoryRequested?: string;
}

export interface ClusterResources {
  nodes: NodeResource[];
  sandboxPodCount: number;
  sandboxCpuRequested: string;
  sandboxMemoryRequested: string;
  physicalCpu: number;
  physicalMemoryBytes: number;
}
