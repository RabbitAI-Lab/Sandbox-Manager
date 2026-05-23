import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, string> = {
  Running: "bg-green-100 text-green-700",
  Paused: "bg-yellow-100 text-yellow-700",
  Creating: "bg-blue-100 text-blue-700",
  Pausing: "bg-yellow-100 text-yellow-700",
  Resuming: "bg-blue-100 text-blue-700",
  Error: "bg-red-100 text-red-700",
  Deleting: "bg-gray-100 text-gray-600",
  pulling: "bg-blue-100 text-blue-700",
  ready: "bg-green-100 text-green-700",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium",
        statusStyles[status] ?? "bg-gray-100 text-gray-600",
      )}
    >
      {(status === "Running" || status === "ready") && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      )}
      {(status === "Creating" || status === "Pausing" || status === "Resuming" || status === "pulling") && (
        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {status}
    </span>
  );
}
