import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { SandboxList } from "@/components/sandbox/SandboxList";
import { CreateSandbox } from "@/components/sandbox/CreateSandbox";
import { Button } from "@/components/common/Button";
import { useSandboxStore } from "@/stores/sandboxStore";
import type { CreateSandboxRequest } from "@/api/types";

function parseCpuMillis(cpu: string): number {
  if (cpu.endsWith("m")) return parseInt(cpu, 10) || 0;
  return Math.round((parseFloat(cpu) || 0) * 1000);
}

function parseMemoryGi(mem: string): number {
  const match = mem.match(/^([\d.]+)Gi$/);
  if (match) return parseFloat(match[1]) || 0;
  const miMatch = mem.match(/^([\d.]+)Mi$/);
  if (miMatch) return (parseFloat(miMatch[1]) || 0) / 1024;
  const kiMatch = mem.match(/^([\d.]+)Ki$/);
  if (kiMatch) return (parseFloat(kiMatch[1]) || 0) / 1024 / 1024;
  return 0;
}

function percentColor(pct: number): string {
  if (pct > 90) return "bg-red-500";
  if (pct > 70) return "bg-yellow-500";
  return "bg-green-500";
}

function formatPhysicalMemory(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}Gi`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(0)}Mi`;
}

export function DashboardPage() {
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();
  const {
    fetchSandboxes,
    createSandbox,
    clusterResources,
    fetchClusterResources,
  } = useSandboxStore();

  useEffect(() => {
    fetchSandboxes();
    fetchClusterResources();
    const interval = setInterval(fetchClusterResources, 30_000);
    return () => clearInterval(interval);
  }, [fetchSandboxes, fetchClusterResources]);

  const handleCreate = async (opts: {
    image: string;
    name: string;
    timeoutSeconds: number;
    env?: Record<string, string>;
    resource?: { cpu?: string; memory?: string };
  }) => {
    const req: CreateSandboxRequest = {
      image: opts.image,
      name: opts.name,
      timeoutSeconds: opts.timeoutSeconds,
      env: opts.env,
      resource: opts.resource,
    };
    await createSandbox(req);
  };

  const resources = clusterResources;

  return (
    <AppShell
      title="RabbitAI-Lab OpenSandbox"
      configured
      actions={
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => navigate("/images")}>
            Images
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            + Create Sandbox
          </Button>
        </div>
      }
    >
      <div className="p-6 max-w-7xl mx-auto">
        {/* Cluster resource status */}
        {resources && (
          <div className="mb-6 space-y-3">
            {/* Summary bar */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-2">
                <span className="font-medium text-gray-700">Sandboxes:</span>
                <span className="text-gray-500">
                  {resources.sandboxPodCount} pods, {resources.sandboxCpuRequested} cores / {resources.sandboxMemoryRequested} memory
                </span>
              </span>
              {resources.physicalCpu > 0 && resources.physicalMemoryBytes > 0 && (
                <span className="inline-flex items-center gap-2">
                  <span className="font-medium text-gray-700">Host:</span>
                  <span className="text-gray-400">
                    {resources.physicalCpu} cores / {formatPhysicalMemory(resources.physicalMemoryBytes)}
                  </span>
                </span>
              )}
            </div>

            {/* Per-node bars */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {resources.nodes.map((node) => {
                const cpuReq = parseCpuMillis(node.sandboxCpuRequested ?? "0");
                const cpuAlloc = parseCpuMillis(node.cpuAllocatable);
                const cpuPct = cpuAlloc > 0 ? Math.min(100, Math.round((cpuReq / cpuAlloc) * 100)) : 0;

                const memReq = parseMemoryGi(node.sandboxMemoryRequested ?? "0");
                const memAlloc = parseMemoryGi(node.memoryAllocatable);
                const memPct = memAlloc > 0 ? Math.min(100, Math.round((memReq / memAlloc) * 100)) : 0;

                const shortName = node.name.replace("desktop-", "");

                return (
                  <div key={node.name} className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="text-xs font-mono text-gray-500 mb-2 truncate" title={node.name}>
                      {shortName}
                    </div>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                          <span>CPU</span>
                          <span>{cpuPct}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${percentColor(cpuPct)}`}
                            style={{ width: `${cpuPct}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-0.5">
                          <span>Mem</span>
                          <span>{memPct}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${percentColor(memPct)}`}
                            style={{ width: `${memPct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <SandboxList />
      </div>
      <CreateSandbox
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
      />
    </AppShell>
  );
}
