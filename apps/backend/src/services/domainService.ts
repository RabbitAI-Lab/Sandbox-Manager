import path from "node:path";
import type { Logger } from "../logger.js";
import { ProfileService } from "./profileService.js";

export class DomainService {
  private logger: Logger;
  private profileService: ProfileService;

  constructor(logger: Logger) {
    this.logger = logger;
    this.profileService = new ProfileService(logger);
  }

  listDomains(): string[] {
    const config = this.profileService.loadServersConfig();
    return config.allowedDomains;
  }

  addDomain(domain: string): string[] {
    const trimmed = domain.trim().toLowerCase();
    if (!trimmed) {
      throw new Error("Domain cannot be empty");
    }
    // Basic validation: allow wildcard prefix and domain characters
    if (!/^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(trimmed)) {
      throw new Error(`Invalid domain format: ${trimmed}`);
    }

    const config = this.profileService.loadServersConfig();
    if (config.allowedDomains.includes(trimmed)) {
      throw new Error(`Domain already exists: ${trimmed}`);
    }

    config.allowedDomains.push(trimmed);
    this.profileService.saveServersConfig(config);
    this.logger.info({ domain: trimmed }, "Domain added");
    return config.allowedDomains;
  }

  removeDomain(domain: string): string[] {
    const trimmed = domain.trim().toLowerCase();
    const config = this.profileService.loadServersConfig();
    const idx = config.allowedDomains.indexOf(trimmed);
    if (idx === -1) {
      throw new Error(`Domain not found: ${trimmed}`);
    }

    config.allowedDomains.splice(idx, 1);
    this.profileService.saveServersConfig(config);
    this.logger.info({ domain: trimmed }, "Domain removed");
    return config.allowedDomains;
  }

  updateDomains(domains: string[]): string[] {
    const normalized = domains.map((d) => {
      const trimmed = d.trim().toLowerCase();
      if (!trimmed) {
        throw new Error("Domain cannot be empty");
      }
      if (!/^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(trimmed)) {
        throw new Error(`Invalid domain format: ${trimmed}`);
      }
      return trimmed;
    });

    // Check for duplicates
    const seen = new Set<string>();
    for (const d of normalized) {
      if (seen.has(d)) {
        throw new Error(`Duplicate domain: ${d}`);
      }
      seen.add(d);
    }

    const config = this.profileService.loadServersConfig();
    config.allowedDomains = normalized;
    this.profileService.saveServersConfig(config);
    this.logger.info({ count: normalized.length }, "Domains updated");
    return config.allowedDomains;
  }
}
