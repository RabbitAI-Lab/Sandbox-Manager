import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";
import { runEnvChecks, installEnvCheckItem } from "@/api/envCheck";
import type { CheckItem } from "@/api/types";

// Fallback commands for items not returning manualCommand from backend
const FALLBACK_COMMANDS: Record<string, string> = {
  "ingress-nginx": `helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx \\
  && helm repo update \\
  && helm install ingress-nginx ingress-nginx/ingress-nginx \\
    --namespace ingress-nginx \\
    --set controller.kind=DaemonSet \\
    --set controller.hostNetwork=true \\
    --set controller.hostPort.enabled=true`,
};

interface EnvCheckModalProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

function getCommand(check: CheckItem): string | undefined {
  return check.manualCommand ?? FALLBACK_COMMANDS[check.id];
}

export function EnvCheckModal({ open, onClose, onOpenSettings }: EnvCheckModalProps) {
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchChecks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await runEnvChecks();
      setChecks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run environment checks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchChecks();
    }
  }, [open, fetchChecks]);

  async function handleInstall(id: string) {
    setChecks((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: "installing" as const } : c)),
    );

    try {
      const result = await installEnvCheckItem(id);
      setChecks((prev) =>
        prev.map((c) => (c.id === id ? result : c)),
      );
    } catch (err) {
      setChecks((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, status: "failed" as const, message: err instanceof Error ? err.message : "Installation failed" }
            : c,
        ),
      );
    }
  }

  function handleConfigure() {
    onClose();
    onOpenSettings?.();
  }

  function handleCopy(id: string) {
    const check = checks.find((c) => c.id === id);
    const cmd = check ? getCommand(check) : undefined;
    if (!cmd) return;
    navigator.clipboard.writeText(cmd.replace(/\\\n\s*/g, " "));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function statusIcon(status: CheckItem["status"]) {
    switch (status) {
      case "checking":
        return (
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        );
      case "passed":
        return (
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case "failed":
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      case "installing":
        return (
          <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        );
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Environment Check"
    >
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2.5">{error}</div>
        )}

        {loading && checks.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-8">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Running environment checks...
          </div>
        ) : (
          <div className="space-y-2">
            {checks.map((check) => (
              <div
                key={check.id}
                className={`rounded-lg border p-3.5 ${
                  check.status === "passed"
                    ? "border-green-200 bg-green-50"
                    : check.status === "failed"
                      ? "border-red-200 bg-red-50"
                      : check.status === "installing"
                        ? "border-orange-200 bg-orange-50"
                        : "border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {statusIcon(check.status)}
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">{check.name}</div>
                      <div className="text-xs text-gray-500">{check.message ?? check.description}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {check.status === "failed" && check.configurable && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleConfigure}
                      >
                        Settings
                      </Button>
                    )}
                    {check.status === "failed" && check.installable && !check.configurable && (
                      <Button
                        size="sm"
                        onClick={() => handleInstall(check.id)}
                      >
                        Install
                      </Button>
                    )}
                    {check.status === "passed" && check.id === "dnsmasq" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleInstall(check.id)}
                      >
                        Reconfigure
                      </Button>
                    )}
                    {check.status === "installing" && (
                      <span className="text-xs text-orange-600 font-medium">Installing...</span>
                    )}
                  </div>
                </div>

                {check.installable && getCommand(check) && (
                  <div className={`mt-2.5 pt-2.5 border-t ${check.status === "passed" ? "border-green-200" : "border-red-200"}`}>
                    <button
                      onClick={() => toggleExpand(check.id)}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <svg className={`w-3 h-3 transition-transform ${expandedIds.has(check.id) ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Manual install command
                    </button>
                    {expandedIds.has(check.id) && (
                      <div className="relative mt-2">
                        <pre className="text-xs bg-gray-900 text-gray-100 rounded-lg px-3 py-2.5 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
                          {getCommand(check)}
                        </pre>
                        <button
                          onClick={() => handleCopy(check.id)}
                          className="absolute top-1.5 right-1.5 text-[10px] text-gray-400 hover:text-white bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded transition-colors"
                        >
                          {copiedId === check.id ? "Copied" : "Copy"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="secondary" size="sm" onClick={fetchChecks} disabled={loading}>
            Re-check
          </Button>
        </div>
      </div>
    </Modal>
  );
}
