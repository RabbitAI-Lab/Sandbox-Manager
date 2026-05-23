import { request } from "./client";
import type { ImageInfo, CachedImage } from "./types";

export function listImages(): Promise<ImageInfo[]> {
  return request("GET", "/images");
}

export function pullImage(image: string): Promise<ImageInfo> {
  return request("POST", "/images", { image });
}

export function getImageStatus(name: string): Promise<ImageInfo> {
  return request("GET", `/images/${name}/status`);
}

export function deleteImage(name: string): Promise<void> {
  return request("DELETE", `/images/${name}`);
}

export function listCachedImages(): Promise<CachedImage[]> {
  return request("GET", "/images/cached");
}
