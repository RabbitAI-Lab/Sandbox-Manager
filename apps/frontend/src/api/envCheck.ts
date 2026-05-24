import { request } from "./client";
import type { CheckItem } from "./types";

export function runEnvChecks(): Promise<CheckItem[]> {
  return request<CheckItem[]>("GET", "/env-check");
}

export function installEnvCheckItem(id: string): Promise<CheckItem> {
  return request<CheckItem>("POST", `/env-check/${id}/install`);
}
