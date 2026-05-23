import { useState } from "react";
import { Button } from "@/components/common/Button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatRelativeTime } from "@/lib/utils";
import type { ImageInfo } from "@/api/types";

interface ImageCardProps {
  image: ImageInfo;
  onDelete: (name: string) => void;
  onRefresh: (name: string) => void;
}

export function ImageCard({ image, onDelete, onRefresh }: ImageCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete(image.daemonSetName);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-mono text-gray-900 truncate" title={image.image}>
            {image.image}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{image.name}</p>
        </div>
        <StatusBadge status={image.status} />
      </div>

      <div className="space-y-1 mb-4">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
          </svg>
          <span>
            Nodes: {image.nodesReady}/{image.nodesTotal} ready
          </span>
        </div>
        {image.createdAt && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{formatRelativeTime(image.createdAt)}</span>
          </div>
        )}
        {image.message && (
          <p className="text-xs text-red-500 mt-1">{image.message}</p>
        )}
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
        <Button variant="ghost" size="sm" onClick={() => onRefresh(image.daemonSetName)}>
          Refresh
        </Button>
        <Button
          variant={confirmDelete ? "danger" : "ghost"}
          size="sm"
          onClick={handleDelete}
          onMouseLeave={() => setConfirmDelete(false)}
          onBlur={() => setTimeout(() => setConfirmDelete(false), 200)}
        >
          {confirmDelete ? "Confirm Delete" : "Delete"}
        </Button>
      </div>
    </div>
  );
}
