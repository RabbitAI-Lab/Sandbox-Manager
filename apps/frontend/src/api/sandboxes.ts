import { request } from "./client";
import type { Sandbox, CreateSandboxRequest, Endpoint } from "./types";

export function listSandboxes(params?: {
  state?: string[];
  page?: number;
  pageSize?: number;
}): Promise<Sandbox[]> {
  const searchParams = new URLSearchParams();
  if (params?.state) params.state.forEach((s) => searchParams.append("state", s));
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize));
  const qs = searchParams.toString();
  return request("GET", `/sandboxes${qs ? `?${qs}` : ""}`);
}

export function getSandbox(id: string): Promise<Sandbox> {
  return request("GET", `/sandboxes/${id}`);
}

export function createSandbox(body: CreateSandboxRequest): Promise<Sandbox> {
  return request("POST", "/sandboxes", body);
}

export function deleteSandbox(id: string): Promise<void> {
  return request("DELETE", `/sandboxes/${id}`);
}

export function pauseSandbox(id: string): Promise<void> {
  return request("POST", `/sandboxes/${id}/pause`);
}

export function resumeSandbox(id: string): Promise<void> {
  return request("POST", `/sandboxes/${id}/resume`);
}

export function getEndpoint(sandboxId: string, port: number): Promise<Endpoint> {
  return request("GET", `/sandboxes/${sandboxId}/endpoints/${port}`);
}
