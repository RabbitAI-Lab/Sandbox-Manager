import { runCommand } from "../utils/runCommand.js";
import type { Logger } from "../logger.js";
import type { NodeResource, ClusterResources, CheckResourceResult } from "../types/index.js";

export class ResourceService {
  private logger: Logger;
  private sandboxNs: string;
  private enabled: boolean;

  constructor(logger: Logger, sandboxNs: string, enabled: boolean) {
    this.logger = logger;
    this.sandboxNs = sandboxNs;
    this.enabled = enabled;
  }

  /**
   * Get cluster resource overview for dashboard display.
   * Focuses on the opensandbox namespace: per-node allocatable + sandbox pod requests.
   */
  async getClusterResources(): Promise<ClusterResources> {
    const [nodes, sandboxPods] = await Promise.all([
      this.fetchNodes(),
      this.fetchPods(this.sandboxNs),
    ]);

    const sandboxRequestsByNode = this.aggregatePodRequests(sandboxPods);

    const nodeResources: NodeResource[] = nodes.map((node) => ({
      name: node.name,
      cpuAllocatable: node.cpuAllocatable,
      memoryAllocatable: node.memoryAllocatable,
      sandboxCpuRequested: sandboxRequestsByNode.get(node.name)?.cpu ?? "0",
      sandboxMemoryRequested: sandboxRequestsByNode.get(node.name)?.memory ?? "0",
    }));

    let totalSandboxCpu = 0;
    let totalSandboxMemory = 0;
    for (const [, reqs] of sandboxRequestsByNode) {
      totalSandboxCpu += this.parseCpuMillis(reqs.cpu);
      totalSandboxMemory += this.parseMemoryBytes(reqs.memory);
    }

    // Derive physical limit from node data (works for Kind/Docker Desktop shared-VM setups)
    const physical = this.derivePhysicalLimits(nodes);

    return {
      nodes: nodeResources,
      sandboxPodCount: sandboxPods.length,
      sandboxCpuRequested: this.formatCpu(totalSandboxCpu),
      sandboxMemoryRequested: this.formatBytes(totalSandboxMemory),
      physicalCpu: physical.cpu,
      physicalMemoryBytes: physical.memoryBytes,
    };
  }

  /**
   * Check if the cluster can fit a new sandbox with the requested resources.
   * Uses ALL pods (all namespaces) to compute true per-node free resources.
   * Fail-open: returns canFit=true if kubectl queries fail.
   */
  async checkSandboxFit(opts: { cpu: string; memory: string }): Promise<CheckResourceResult> {
    if (!this.enabled) {
      return { canFit: true };
    }

    try {
      const requestedCpu = this.parseCpuMillis(opts.cpu);
      const requestedMemory = this.parseMemoryBytes(opts.memory);

      const [nodes, allPods] = await Promise.all([
        this.fetchNodes(),
        this.fetchAllNonTerminalPods(),
      ]);

      const podRequestsByNode = this.aggregatePodRequests(allPods);

      let canFit = false;
      const availablePerNode: Array<{ node: string; freeMemory: string; freeCpu: string }> = [];

      for (const node of nodes) {
        const nodeRequests = podRequestsByNode.get(node.name);
        const usedCpu = nodeRequests ? this.parseCpuMillis(nodeRequests.cpu) : 0;
        const usedMemory = nodeRequests ? this.parseMemoryBytes(nodeRequests.memory) : 0;
        const allocatableCpu = this.parseCpuMillis(node.cpuAllocatable);
        const allocatableMemory = this.parseMemoryBytes(node.memoryAllocatable);

        const freeCpu = allocatableCpu - usedCpu;
        const freeMemory = allocatableMemory - usedMemory;

        availablePerNode.push({
          node: node.name,
          freeMemory: this.formatBytes(freeMemory),
          freeCpu: `${(freeCpu / 1000).toFixed(2)}`,
        });

        if (freeCpu >= requestedCpu && freeMemory >= requestedMemory) {
          canFit = true;
        }
      }

      if (!canFit) {
        const nodesInfo = availablePerNode
          .map((n) => `${n.node}: ${n.freeMemory} memory, ${n.freeCpu} cpu`)
          .join("; ");
        return {
          canFit: false,
          reason: `No node has enough free resources. Requested: ${opts.memory} memory, ${opts.cpu} cpu. Available per node: ${nodesInfo}`,
          availablePerNode,
        };
      }

      return { canFit: true };
    } catch (err) {
      this.logger.warn(
        { err: (err as Error).message },
        "Resource check failed, allowing creation to proceed (fail-open)",
      );
      return { canFit: true };
    }
  }

  // ── private helpers ──

  private async fetchNodes(): Promise<
    Array<{ name: string; cpuAllocatable: string; memoryAllocatable: string }>
  > {
    try {
      const result = await runCommand("kubectl", ["get", "nodes", "-o", "json"], this.logger, 15_000);
      if (result.code !== 0) return [];

      const data = JSON.parse(result.stdout) as {
        items: Array<{
          metadata: { name: string };
          status: { allocatable: Record<string, string> };
        }>;
      };

      return (data.items ?? []).map((node) => ({
        name: node.metadata.name,
        cpuAllocatable: node.status.allocatable.cpu || "0",
        memoryAllocatable: node.status.allocatable.memory || "0",
      }));
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, "Failed to fetch nodes from kubectl");
      return [];
    }
  }

  /** Fetch pods from the opensandbox namespace (for dashboard display). */
  private async fetchPods(namespace: string): Promise<
    Array<{ nodeName: string; containers: Array<{ resources?: { requests?: Record<string, string> } }> }>
  > {
    try {
      const result = await runCommand(
        "kubectl",
        [
          "get", "pods", "-n", namespace, "-o", "json",
          "--field-selector=status.phase!=Failed,status.phase!=Succeeded",
        ],
        this.logger,
        15_000,
      );
      if (result.code !== 0) return [];

      const data = JSON.parse(result.stdout) as {
        items: Array<{
          spec: { nodeName?: string; containers?: Array<{ resources?: { requests?: Record<string, string> } }> };
        }>;
      };

      return (data.items ?? [])
        .filter((pod) => pod.spec.nodeName)
        .map((pod) => ({
          nodeName: pod.spec.nodeName!,
          containers: pod.spec.containers ?? [],
        }));
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, `Failed to fetch pods from namespace ${namespace}`);
      return [];
    }
  }

  /** Fetch ALL non-terminal pods across all namespaces (for fit check). */
  private async fetchAllNonTerminalPods(): Promise<
    Array<{ nodeName: string; containers: Array<{ resources?: { requests?: Record<string, string> } }> }>
  > {
    try {
      const result = await runCommand(
        "kubectl",
        [
          "get", "pods", "-A", "-o", "json",
          "--field-selector=status.phase!=Failed,status.phase!=Succeeded",
        ],
        this.logger,
        15_000,
      );
      if (result.code !== 0) return [];

      const data = JSON.parse(result.stdout) as {
        items: Array<{
          spec: { nodeName?: string; containers?: Array<{ resources?: { requests?: Record<string, string> } }> };
        }>;
      };

      return (data.items ?? [])
        .filter((pod) => pod.spec.nodeName)
        .map((pod) => ({
          nodeName: pod.spec.nodeName!,
          containers: pod.spec.containers ?? [],
        }));
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, "Failed to fetch all pods");
      return [];
    }
  }

  private aggregatePodRequests(
    pods: Array<{ nodeName: string; containers: Array<{ resources?: { requests?: Record<string, string> } }> }>,
  ): Map<string, { cpu: string; memory: string }> {
    const byNode = new Map<string, { cpu: number; memory: number }>();

    for (const pod of pods) {
      let podCpu = 0;
      let podMemory = 0;
      for (const container of pod.containers) {
        const reqs = container.resources?.requests;
        if (reqs?.cpu) podCpu += this.parseCpuMillis(reqs.cpu);
        if (reqs?.memory) podMemory += this.parseMemoryBytes(reqs.memory);
      }
      if (podCpu === 0 && podMemory === 0) continue;

      const existing = byNode.get(pod.nodeName);
      if (existing) {
        existing.cpu += podCpu;
        existing.memory += podMemory;
      } else {
        byNode.set(pod.nodeName, { cpu: podCpu, memory: podMemory });
      }
    }

    const result = new Map<string, { cpu: string; memory: string }>();
    for (const [node, { cpu, memory }] of byNode) {
      result.set(node, {
        cpu: `${cpu}m`,
        memory: this.formatBytes(memory),
      });
    }
    return result;
  }

  /**
   * Derive the physical resource limits from node data.
   * In Kind/Docker Desktop, all nodes share the same VM so they report identical
   * allocatable — use one node's value as the single physical reference.
   * In real multi-node K8s, sum all nodes' allocatable as the cluster total.
   */
  private derivePhysicalLimits(
    nodes: Array<{ cpuAllocatable: string; memoryAllocatable: string }>,
  ): { cpu: number; memoryBytes: number } {
    if (nodes.length === 0) return { cpu: 0, memoryBytes: 0 };

    // Check if all nodes have identical allocatable (shared-VM setup like Kind)
    const first = nodes[0];
    const allSame = nodes.every(
      (n) => n.cpuAllocatable === first.cpuAllocatable && n.memoryAllocatable === first.memoryAllocatable,
    );

    if (allSame) {
      // Kind/Docker Desktop: use one node's allocatable as the VM limit
      return {
        cpu: Math.round(this.parseCpuMillis(first.cpuAllocatable) / 1000),
        memoryBytes: this.parseMemoryBytes(first.memoryAllocatable),
      };
    }

    // Real multi-node cluster: sum all nodes
    let totalCpu = 0;
    let totalMemory = 0;
    for (const node of nodes) {
      totalCpu += this.parseCpuMillis(node.cpuAllocatable);
      totalMemory += this.parseMemoryBytes(node.memoryAllocatable);
    }
    return { cpu: Math.round(totalCpu / 1000), memoryBytes: totalMemory };
  }

  private parseCpuMillis(cpu: string): number {
    const trimmed = cpu.trim();
    if (trimmed.endsWith("m")) {
      return parseInt(trimmed.slice(0, -1), 10) || 0;
    }
    return Math.round((parseFloat(trimmed) || 0) * 1000);
  }

  private parseMemoryBytes(mem: string): number {
    const trimmed = mem.trim();
    const unitMatch = trimmed.match(/^([\d.]+)(Ki|Mi|Gi|Ti|K|M|G|T|k|m|g|t)?$/i);
    if (!unitMatch) return 0;

    const value = parseFloat(unitMatch[1]) || 0;
    const unit = unitMatch[2]?.toLowerCase() || "";

    switch (unit) {
      case "ki": return value * 1024;
      case "mi": return value * 1024 * 1024;
      case "gi": return value * 1024 * 1024 * 1024;
      case "ti": return value * 1024 * 1024 * 1024 * 1024;
      case "k": case "": return value * 1000;
      case "m": return value * 1000 * 1000;
      case "g": return value * 1000 * 1000 * 1000;
      case "t": return value * 1000 * 1000 * 1000 * 1000;
      default: return 0;
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}Gi`;
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)}Mi`;
    }
    if (bytes >= 1024) {
      return `${(bytes / 1024).toFixed(1)}Ki`;
    }
    return `${bytes}`;
  }

  private formatCpu(millis: number): string {
    if (millis >= 1000) {
      return `${(millis / 1000).toFixed(1)}`;
    }
    return `${millis}m`;
  }
}
