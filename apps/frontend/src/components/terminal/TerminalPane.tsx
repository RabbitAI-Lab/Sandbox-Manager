import { useTerminal } from "@/hooks/useTerminal";

interface TerminalPaneProps {
  sandboxId: string;
  sessionId: string;
}

export function TerminalPane({ sandboxId, sessionId }: TerminalPaneProps) {
  const { containerRef, connected, reconnecting, error } = useTerminal({
    sandboxId,
    sessionId,
  });

  return (
    <div className="relative h-full w-full bg-[#1e1e2e]">
      {/* Connection status bar */}
      <div className="absolute top-0 right-0 z-10 flex items-center gap-2 px-3 py-1.5">
        {error && (
          <span className="text-xs text-red-400 bg-red-900/30 px-2 py-0.5 rounded">{error}</span>
        )}
        {reconnecting && (
          <span className="text-xs text-yellow-400 bg-yellow-900/30 px-2 py-0.5 rounded flex items-center gap-1">
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Reconnecting
          </span>
        )}
        {connected && (
          <span className="w-2 h-2 rounded-full bg-green-400" />
        )}
      </div>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
