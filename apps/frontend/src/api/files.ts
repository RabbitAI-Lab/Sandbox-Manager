import { request } from "./client";
import type { FileEntry } from "./types";

export function listFiles(sandboxId: string, dirPath: string): Promise<FileEntry[]> {
  return request("GET", `/sandboxes/${sandboxId}/files?path=${encodeURIComponent(dirPath)}`);
}

export function getFileContent(sandboxId: string, filePath: string): Promise<string> {
  return fetch(`/api/sandboxes/${sandboxId}/files/content?path=${encodeURIComponent(filePath)}`)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to read file: ${res.status}`);
      return res.text();
    });
}

export function writeFile(sandboxId: string, filePath: string, content: string): Promise<void> {
  return request("POST", `/sandboxes/${sandboxId}/files/write`, {
    path: filePath,
    content,
  });
}

export function deleteFile(sandboxId: string, filePath: string): Promise<void> {
  return request("DELETE", `/sandboxes/${sandboxId}/files/files?path=${encodeURIComponent(filePath)}`);
}

export function createDirectory(sandboxId: string, dirPath: string): Promise<void> {
  return request("POST", `/sandboxes/${sandboxId}/files/mkdir`, {
    paths: [dirPath],
  });
}
