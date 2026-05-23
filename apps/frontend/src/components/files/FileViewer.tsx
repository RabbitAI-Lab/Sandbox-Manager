import { useState, useEffect } from "react";
import { getFileContent } from "@/api/files";

interface FileViewerProps {
  sandboxId: string;
  filePath: string | null;
}

export function FileViewer({ sandboxId, filePath }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath) {
      setContent(null);
      return;
    }

    setLoading(true);
    setError(null);
    getFileContent(sandboxId, filePath)
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch((err) => {
        setError((err as Error).message);
        setLoading(false);
      });
  }, [sandboxId, filePath]);

  if (!filePath) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Select a file to view
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500 text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 bg-gray-50 border-b text-xs text-gray-500 font-mono truncate">
        {filePath}
      </div>
      <pre className="flex-1 overflow-auto p-4 text-sm font-mono text-gray-800 whitespace-pre-wrap bg-white">
        {content}
      </pre>
    </div>
  );
}
