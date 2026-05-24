import { request } from "./client";

export function listDomains(): Promise<string[]> {
  return request("GET", "/domains");
}

export function addDomain(domain: string): Promise<string[]> {
  return request("POST", "/domains", { domain });
}

export function removeDomain(domain: string): Promise<string[]> {
  return request("DELETE", `/domains/${encodeURIComponent(domain)}`);
}

export function updateDomains(domains: string[]): Promise<string[]> {
  return request("PUT", "/domains", { domains });
}
