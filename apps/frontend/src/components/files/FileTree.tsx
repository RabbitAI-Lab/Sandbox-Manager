import { useEffect } from "react";
import { FileTreeNode } from "./FileTreeNode";
import { useFileTree } from "@/hooks/useFileTree";
import type { FileEntry } from "@/api/types";

interface FileTreeProps {
  sandboxId: string;
  onFileSelect: (path: string) => void;
}

export function FileTree({ sandboxId, onFileSelect }: FileTreeProps) {
  const { fetchRoot, isExpanded, isLoading, getChildren, toggleDir, tree, error } = useFileTree(sandboxId);

  useEffect(() => {
    fetchRoot();
  }, [fetchRoot]);

  const rootEntries = getChildren("/");

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-400 text-xs p-4 text-center gap-2">
        <span>Failed to load files</span>
        <span className="text-red-300 text-[10px]">{error}</span>
      </div>
    );
  }

  if (rootEntries.length === 0 && !tree.has("/")) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto py-2">
      {rootEntries.map((entry: FileEntry) => (
        <FileTreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          sandboxId={sandboxId}
          isExpanded={isExpanded}
          isLoading={isLoading}
          getChildren={getChildren}
          onToggle={toggleDir}
          onFileSelect={onFileSelect}
        />
      ))}
    </div>
  );
}
