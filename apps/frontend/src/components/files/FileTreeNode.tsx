import { useState } from "react";
import type { FileEntry } from "@/api/types";

interface FileTreeNodeProps {
  entry: FileEntry;
  depth: number;
  sandboxId: string;
  isExpanded: (path: string) => boolean;
  isLoading: (path: string) => boolean;
  getChildren: (path: string) => FileEntry[];
  onToggle: (path: string) => void;
  onFileSelect: (path: string) => void;
}

export function FileTreeNode({
  entry,
  depth,
  sandboxId: _sandboxId,
  isExpanded,
  isLoading,
  getChildren,
  onToggle,
  onFileSelect,
}: FileTreeNodeProps) {
  const expanded = isExpanded(entry.path);
  const loading = isLoading(entry.path);
  const children = expanded ? getChildren(entry.path) : [];

  const handleClick = () => {
    if (entry.isDir) {
      onToggle(entry.path);
    } else {
      onFileSelect(entry.path);
    }
  };

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1 px-2 hover:bg-gray-100 cursor-pointer text-sm text-gray-700 rounded"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        {entry.isDir ? (
          <>
            <svg
              className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M6 6L14 10L6 14V6Z" />
            </svg>
            <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          </>
        ) : (
          <>
            <span className="w-3.5" />
            <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
            </svg>
          </>
        )}
        <span className="truncate">{entry.name}</span>
        {loading && (
          <svg className="w-3 h-3 animate-spin text-gray-400 ml-auto" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </div>
      {expanded && children.map((child) => (
        <FileTreeNode
          key={child.path}
          entry={child}
          depth={depth + 1}
          sandboxId={_sandboxId}
          isExpanded={isExpanded}
          isLoading={isLoading}
          getChildren={getChildren}
          onToggle={onToggle}
          onFileSelect={onFileSelect}
        />
      ))}
    </div>
  );
}
