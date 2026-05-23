import { useNavigate } from "react-router-dom";
import { Button } from "@/components/common/Button";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { Sandbox } from "@/api/types";
import { formatRelativeTime } from "@/lib/utils";

interface SandboxCardProps {
  sandbox: Sandbox;
  onDelete: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}

export function SandboxCard({ sandbox, onDelete, onPause, onResume }: SandboxCardProps) {
  const navigate = useNavigate();
  const isRunning = sandbox.status === "Running";
  const isPaused = sandbox.status === "Paused";
  const isBusy = sandbox.status === "Creating" || sandbox.status === "Pausing" || sandbox.status === "Resuming";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-gray-900 truncate">{sandbox.name || sandbox.id}</h3>
        <StatusBadge status={sandbox.status} />
      </div>

      <div className="space-y-1.5 text-sm text-gray-500 mb-4">
        <p className="font-mono text-xs truncate">{sandbox.image}</p>
        {sandbox.createdAt && (
          <p>{formatRelativeTime(sandbox.createdAt)}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={!isRunning}
          onClick={() => navigate(`/sandbox/${sandbox.id}`)}
        >
          Connect
        </Button>
        {isRunning && (
          <Button variant="secondary" size="sm" onClick={() => onPause(sandbox.id)}>
            Pause
          </Button>
        )}
        {isPaused && (
          <Button variant="secondary" size="sm" onClick={() => onResume(sandbox.id)}>
            Resume
          </Button>
        )}
        <Button
          variant="danger"
          size="sm"
          disabled={isBusy}
          onClick={() => {
            if (confirm("Delete this sandbox?")) onDelete(sandbox.id);
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
