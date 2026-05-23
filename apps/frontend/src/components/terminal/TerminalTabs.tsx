import { useTerminalStore } from "@/stores/terminalStore";

interface TerminalTabsProps {
  sandboxId: string;
}

export function TerminalTabs({ sandboxId }: TerminalTabsProps) {
  const { sessions, addSession, removeSession, setActive, renameSession } = useTerminalStore();
  const sandboxSessions = sessions.filter((s) => s.sandboxId === sandboxId);

  const handleAdd = () => {
    addSession(sandboxId);
  };

  const handleDoubleClick = (id: string, currentTitle: string) => {
    const newTitle = prompt("Tab name:", currentTitle);
    if (newTitle?.trim()) renameSession(id, newTitle.trim());
  };

  if (sandboxSessions.length === 0) return null;

  return (
    <div className="flex items-center bg-gray-100 border-b border-gray-200 px-2 h-9 shrink-0">
      {sandboxSessions.map((session) => (
        <div
          key={session.id}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg cursor-pointer select-none ${
            session.active
              ? "bg-white text-gray-900 border-t-2 border-blue-600"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
          }`}
          onClick={() => setActive(session.id)}
          onDoubleClick={() => handleDoubleClick(session.id, session.title)}
        >
          <span>{session.title}</span>
          <button
            className="text-gray-400 hover:text-gray-600 ml-1"
            onClick={(e) => {
              e.stopPropagation();
              removeSession(session.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="ml-1 text-blue-600 hover:text-blue-700 text-lg font-bold px-2 py-0.5 rounded hover:bg-blue-50"
        onClick={handleAdd}
        title="New terminal"
      >
        +
      </button>
    </div>
  );
}
