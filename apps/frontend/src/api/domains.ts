import { request } from "./client";

export interface DomainsResponse {
  domains: string[];
  activeDomain: string | null;
}

export function listDomains(): Promise<DomainsResponse> {
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

export function activateDomain(domain: string): Promise<DomainsResponse> {
  return request("PUT", "/domains/activate", { domain });
}
