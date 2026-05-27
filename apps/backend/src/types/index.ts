import type { Request } from "express";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    requestId?: string;
  };
}

export interface CreateSandboxBody {
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
}

export interface RunCommandBody {
  command: string;
  cwd?: string;
  timeoutSeconds?: number;
  envs?: Record<string, string>;
}

export interface WriteFileBody {
  path: string;
  content: string;
  mode?: number;
}

export interface MkdirBody {
  paths: string[];
  mode?: number;
}

export interface MoveFilesBody {
  entries: Array<{ src: string; dest: string }>;
}

export interface CreateSessionBody {
  workingDirectory?: string;
  envs?: Record<string, string>;
}

export interface RunInSessionBody {
  command: string;
  cwd?: string;
  timeoutSeconds?: number;
  envs?: Record<string, string>;
}

export interface SandboxEndpointResponse {
  url: string;
  scheme: string;
  host: string;
  port: number;
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

export interface PullImageBody {
  image: string;
}

export interface CachedImage {
  image: string;
  node: string;
  sizeBytes?: number;
}

// Cluster resource monitoring

export interface NodeResource {
  name: string;
  cpuAllocatable: string;
  memoryAllocatable: string;
  /** Sandbox pod requests on this node (opensandbox namespace only) */
  sandboxCpuRequested?: string;
  sandboxMemoryRequested?: string;
}

export interface ClusterResources {
  nodes: NodeResource[];
  sandboxPodCount: number;
  sandboxCpuRequested: string;
  sandboxMemoryRequested: string;
  /** Physical CPU cores (derived from node allocatable — single node in shared-VM, sum in real K8s) */
  physicalCpu: number;
  /** Physical memory bytes (derived from node allocatable) */
  physicalMemoryBytes: number;
}

export interface CheckResourceResult {
  canFit: boolean;
  reason?: string;
  availablePerNode?: Array<{ node: string; freeMemory: string; freeCpu: string }>;
}
