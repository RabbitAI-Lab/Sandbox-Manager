import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/common/Button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TerminalTabs } from "@/components/terminal/TerminalTabs";
import { TerminalPane } from "@/components/terminal/TerminalPane";
import { FileTree } from "@/components/files/FileTree";
import { FileViewer } from "@/components/files/FileViewer";
import { useSandbox } from "@/hooks/useSandbox";
import { useTerminalStore } from "@/stores/terminalStore";

export function SandboxPage() {
  const { id: sandboxId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { sandbox, loading, error } = useSandbox(sandboxId!);
  const { sessions, addSession } = useTerminalStore();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [showFileViewer, setShowFileViewer] = useState(false);
  const [leftWidth, setLeftWidth] = useState(250);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const sandboxSessions = sessions.filter((s) => s.sandboxId === sandboxId);
  const activeSession = sandboxSessions.find((s) => s.active);

  // Create initial terminal session
  useEffect(() => {
    if (sandboxId && sandboxSessions.length === 0) {
      addSession(sandboxId);
    }
  }, [sandboxId, sandboxSessions.length, addSession]);

  // Draggable divider
  const handleMouseDown = useCallback(() => {
    dragging.current = true;
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = Math.max(150, Math.min(containerRect.width - 300, e.clientX - containerRect.left));
      setLeftWidth(newWidth);
    };
    const handleMouseUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  if (loading) {
    return (
      <AppShell title="Loading..." onBack={() => navigate("/dashboard")}>
        <div className="flex items-center justify-center h-full text-gray-400">
          Loading sandbox...
        </div>
      </AppShell>
    );
  }

  if (error || !sandbox) {
    return (
      <AppShell title="Sandbox Not Found" onBack={() => navigate("/dashboard")}>
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <div className="text-red-500 text-sm">
            {error ?? "Sandbox not found or has expired."}
          </div>
          <Button variant="primary" onClick={() => navigate("/dashboard")}>
            Back to Dashboard
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={sandbox.name || sandbox.id}
      onBack={() => navigate("/dashboard")}
      actions={
        <div className="flex items-center gap-3">
          <StatusBadge status={sandbox.status} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => addSession(sandboxId!)}
          >
            + New Terminal
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFileViewer(!showFileViewer)}
          >
            {showFileViewer ? "Hide Viewer" : "Show Viewer"}
          </Button>
        </div>
      }
    >
      <div ref={containerRef} className="flex h-full select-none">
        {/* Left panel: File Tree */}
        <div className="shrink-0 border-r border-gray-200 bg-white flex flex-col" style={{ width: leftWidth }}>
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b bg-gray-50">
            Files
          </div>
          <div className="flex-1 overflow-hidden">
            <FileTree sandboxId={sandboxId!} onFileSelect={(path) => { setSelectedFile(path); setShowFileViewer(true); }} />
          </div>
        </div>

        {/* Divider */}
        <div
          className="w-1.5 bg-gray-100 hover:bg-blue-200 cursor-col-resize shrink-0 transition-colors"
          onMouseDown={handleMouseDown}
        />

        {/* Right panel: Terminal */}
        <div className="flex-1 flex flex-col min-w-0">
          <TerminalTabs sandboxId={sandboxId!} />
          <div className="flex-1 relative">
            {sandboxSessions.map((session) => (
              <div
                key={session.id}
                className="absolute inset-0"
                style={{
                  visibility: session.id === activeSession?.id ? "visible" : "hidden",
                  height: session.id === activeSession?.id ? "100%" : "0",
                  overflow: session.id === activeSession?.id ? "visible" : "hidden",
                }}
              >
                <TerminalPane sandboxId={sandboxId!} sessionId={session.id} />
              </div>
            ))}
          </div>
        </div>

        {/* File Viewer overlay */}
        {showFileViewer && selectedFile && (
          <div className="fixed inset-0 z-40 flex items-center justify-center">
            <div className="fixed inset-0 bg-black/20" onClick={() => setShowFileViewer(false)} />
            <div className="relative z-50 bg-white rounded-xl shadow-2xl w-[700px] max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="text-sm font-semibold text-gray-900 truncate">{selectedFile}</h3>
                <button
                  onClick={() => setShowFileViewer(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <FileViewer sandboxId={sandboxId!} filePath={selectedFile} />
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
