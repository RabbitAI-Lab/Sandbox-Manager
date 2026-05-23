import { useState, useCallback, useRef } from "react";
import { listFiles } from "@/api/files";
import type { FileEntry } from "@/api/types";

export function useFileTree(sandboxId: string) {
  const [tree, setTree] = useState<Map<string, FileEntry[]>>(new Map());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const failedDirs = useRef<Set<string>>(new Set());

  const fetchChildren = useCallback(
    async (dirPath: string) => {
      if (loadingDirs.has(dirPath) || failedDirs.current.has(dirPath)) return;
      setLoadingDirs((prev) => new Set(prev).add(dirPath));
      try {
        const entries = await listFiles(sandboxId, dirPath);
        setTree((prev) => new Map(prev).set(dirPath, entries));
        setError(null);
      } catch (err) {
        failedDirs.current.add(dirPath);
        setError((err as Error).message);
      } finally {
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.delete(dirPath);
          return next;
        });
      }
    },
    [sandboxId],
  );

  const fetchRoot = useCallback(() => {
    failedDirs.current.delete("/");
    setError(null);
    fetchChildren("/");
  }, [fetchChildren]);

  const toggleDir = useCallback(
    (dirPath: string) => {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        if (next.has(dirPath)) {
          next.delete(dirPath);
        } else {
          next.add(dirPath);
          if (!tree.has(dirPath) && !failedDirs.current.has(dirPath)) fetchChildren(dirPath);
        }
        return next;
      });
    },
    [tree, fetchChildren],
  );

  const isExpanded = useCallback((dirPath: string) => expandedDirs.has(dirPath), [expandedDirs]);
  const isLoading = useCallback((dirPath: string) => loadingDirs.has(dirPath), [loadingDirs]);
  const getChildren = useCallback((dirPath: string) => tree.get(dirPath) ?? [], [tree]);

  return { fetchRoot, fetchChildren, toggleDir, isExpanded, isLoading, getChildren, tree, error };
}
