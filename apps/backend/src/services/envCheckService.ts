import { existsSync } from "node:fs";
import { runCommand } from "../utils/runCommand.js";
import { DomainService } from "./domainService.js";
import type { Logger } from "../logger.js";

export interface CheckItem {
  id: string;
  name: string;
  description: string;
  status: "checking" | "passed" | "failed" | "installing";
  message?: string;
  installable?: boolean;
  configurable?: boolean;
  manualCommand?: string;
}

export function checkDomainConfig(logger: Logger): CheckItem {
  const item: CheckItem = {
    id: "domain-config",
    name: "Domain Allowlist",
    description: "Allowed domains for sandbox access control",
    status: "checking",
    configurable: true,
  };

  try {
    const domainService = new DomainService(logger);
    const domains = domainService.listDomains();

    if (domains.length > 0) {
      item.status = "passed";
      item.message = `${domains.length} domain(s) configured`;
    } else {
      item.status = "failed";
      item.message = "No domains configured";
    }
  } catch {
    item.status = "failed";
    item.message = "Failed to check domain configuration";
  }

  return item;
}

export async function checkIngressNginx(logger: Logger): Promise<CheckItem> {
  const item: CheckItem = {
    id: "ingress-nginx",
    name: "Ingress Nginx",
    description: "Kubernetes Ingress Nginx Controller",
    status: "checking",
    installable: true,
  };

  try {
    // Check if ingress-nginx helm release exists
    const helmResult = await runCommand(
      "helm",
      ["status", "ingress-nginx", "-n", "ingress-nginx"],
      logger,
      10_000,
    ).catch(() => null);

    if (helmResult && helmResult.code === 0) {
      item.status = "passed";
      item.message = "Ingress Nginx is installed";
      return item;
    }

    // Also check via kubectl for the deployment
    const kubectlResult = await runCommand(
      "kubectl",
      ["get", "deployment", "-n", "ingress-nginx"],
      logger,
      10_000,
    ).catch(() => null);

    if (kubectlResult && kubectlResult.code === 0 && kubectlResult.stdout.includes("ingress-nginx-controller")) {
      item.status = "passed";
      item.message = "Ingress Nginx is installed";
      return item;
    }

    item.status = "failed";
    item.message = "Ingress Nginx is not installed";
  } catch {
    item.status = "failed";
    item.message = "Failed to check Ingress Nginx status";
  }

  return item;
}

export async function installIngressNginx(logger: Logger): Promise<CheckItem> {
  const item: CheckItem = {
    id: "ingress-nginx",
    name: "Ingress Nginx",
    description: "Kubernetes Ingress Nginx Controller",
    status: "installing",
    installable: true,
  };

  try {
    // Add ingress-nginx helm repo
    const addRepo = await runCommand(
      "helm",
      ["repo", "add", "ingress-nginx", "https://kubernetes.github.io/ingress-nginx"],
      logger,
      30_000,
    );
    if (addRepo.code !== 0 && !addRepo.stderr.includes("already exists")) {
      item.status = "failed";
      item.message = `Failed to add helm repo: ${addRepo.stderr.trim()}`;
      return item;
    }

    // Update helm repo
    await runCommand("helm", ["repo", "update"], logger, 30_000);

    // Create namespace if not exists
    await runCommand(
      "sh",
      ["-c", "kubectl create namespace ingress-nginx --dry-run=client -o yaml | kubectl apply -f -"],
      logger,
      10_000,
    );

    // Install ingress-nginx via helm
    const install = await runCommand(
      "helm",
      [
        "install",
        "ingress-nginx",
        "ingress-nginx/ingress-nginx",
        "--namespace", "ingress-nginx",
        "--set", "controller.kind=DaemonSet",
        "--set", "controller.hostNetwork=true",
        "--set", "controller.hostPort.enabled=true",
        "--wait",
        "--timeout", "180s",
      ],
      logger,
      240_000,
    );

    if (install.code !== 0) {
      item.status = "failed";
      item.message = `Installation failed: ${install.stderr.trim()}`;
      return item;
    }

    item.status = "passed";
    item.message = "Ingress Nginx installed successfully";
  } catch (err) {
    item.status = "failed";
    item.message = `Installation error: ${err instanceof Error ? err.message : String(err)}`;
  }

  return item;
}

// Build dnsmasq config and manual command from domains
function buildDnsmasqCommand(domains: string[]): string {
  // Strip *. prefix — dnsmasq address=/domain/ip covers all subdomains automatically
  const addressLines = domains
    .map((d) => `address=/${d.replace(/^\*\./, "")}/127.0.0.1`)
    .join("\n");

  const confContent = [
    "# /etc/dnsmasq.d/sandbox-domains.conf",
    addressLines,
  ].join("\n");

  const resolverLines = domains
    .map((d) => `echo 'nameserver 127.0.0.1' | sudo tee /etc/resolver/${d.replace(/^\*\./, "")} > /dev/null`)
    .join("\n");

  return [
    `# Install dnsmasq (macOS)`,
    `brew install dnsmasq`,
    ``,
    `# Create config`,
    `cat > $(brew --prefix)/etc/dnsmasq.d/sandbox-domains.conf << 'EOF'`,
    confContent,
    `EOF`,
    ``,
    `# Restart dnsmasq`,
    `sudo brew services restart dnsmasq`,
    ``,
    `# Create macOS resolver files`,
    `sudo mkdir -p /etc/resolver`,
    resolverLines,
  ].join("\n");
}

export async function checkDnsmasq(logger: Logger): Promise<CheckItem> {
  const item: CheckItem = {
    id: "dnsmasq",
    name: "Dnsmasq (Local DNS)",
    description: "Local DNS resolver for custom domains",
    status: "checking",
    installable: true,
  };

  try {
    const domainService = new DomainService(logger);
    const domains = domainService.listDomains();

    if (domains.length > 0) {
      item.manualCommand = buildDnsmasqCommand(domains);
    }

    // Step 1: check if dnsmasq binary is installed
    const check = await runCommand("dnsmasq", ["--version"], logger, 10_000).catch(() => null);
    if (!check || check.code !== 0) {
      item.status = "failed";
      item.message = "Not installed";
      return item;
    }

    if (domains.length === 0) {
      item.status = "failed";
      item.message = "Installed, but no domains configured";
      return item;
    }

    // Collect all issues
    const issues: string[] = [];

    // Step 2: check if dnsmasq process is running (pgrep, not brew services)
    const procCheck = await runCommand("pgrep", ["-x", "dnsmasq"], logger, 5_000).catch(() => null);
    const isRunning = !!procCheck && procCheck.stdout.trim().length > 0;

    if (!isRunning) {
      issues.push("not running");
    }

    // Step 3: check config file
    const confCheck = await runCommand(
      "sh",
      ["-c", "cat $(brew --prefix)/etc/dnsmasq.d/sandbox-domains.conf 2>/dev/null || echo ''"],
      logger,
      5_000,
    ).catch(() => null);
    const confContent = confCheck?.stdout ?? "";
    const allConfigured = domains.every((d) => confContent.includes(`address=/${d.replace(/^\*\./, "")}/`));

    if (!allConfigured || confContent.length === 0) {
      issues.push("config missing domains");
    }

    // Step 4: check macOS resolver files (strip *. prefix for resolver filename)
    const missingResolvers: string[] = [];
    for (const d of domains) {
      const resolverName = d.replace(/^\*\./, "");
      const res = await runCommand(
        "sh",
        ["-c", `test -f /etc/resolver/${resolverName} && grep -q 'nameserver 127.0.0.1' /etc/resolver/${resolverName} && echo yes || echo no`],
        logger,
        5_000,
      ).catch(() => null);
      if (!res || !res.stdout.includes("yes")) {
        missingResolvers.push(resolverName);
      }
    }
    if (missingResolvers.length > 0) {
      issues.push(`missing resolver: ${missingResolvers.join(", ")}`);
    }

    // Step 5: verify DNS resolution (only if process running)
    if (isRunning && issues.length === 0) {
      const testDomain = `test.${domains[0].replace(/^\*\./, "")}`;
      const dnsCheck = await runCommand(
        "sh",
        ["-c", `dig +short ${testDomain} @127.0.0.1 2>/dev/null`],
        logger,
        5_000,
      ).catch(() => null);
      const dnsOutput = dnsCheck?.stdout ?? "";
      if (!dnsOutput.includes("127.0.0.1")) {
        issues.push("DNS resolution test failed");
      }
    }

    if (issues.length > 0) {
      item.status = "failed";
      item.message = issues.join(" | ");
    } else {
      item.status = "passed";
      item.message = `Running, ${domains.length} domain(s) configured`;
    }
  } catch {
    item.status = "failed";
    item.message = "Failed to check dnsmasq status";
  }

  return item;
}

export async function installDnsmasq(logger: Logger): Promise<CheckItem> {
  const item: CheckItem = {
    id: "dnsmasq",
    name: "Dnsmasq (Local DNS)",
    description: "Local DNS resolver for custom domains",
    status: "installing",
    installable: true,
  };

  try {
    const domainService = new DomainService(logger);
    const domains = domainService.listDomains();

    if (domains.length > 0) {
      item.manualCommand = buildDnsmasqCommand(domains);
    }

    // Install dnsmasq via brew if not present
    const check = await runCommand("dnsmasq", ["--version"], logger, 10_000).catch(() => null);
    if (!check || check.code !== 0) {
      const install = await runCommand("brew", ["install", "dnsmasq"], logger, 120_000);
      if (install.code !== 0) {
        item.status = "failed";
        item.message = `Failed to install dnsmasq: ${install.stderr.trim()}`;
        return item;
      }
    }

    if (domains.length === 0) {
      item.status = "failed";
      item.message = "No domains configured. Set up domains first.";
      return item;
    }

    // Generate config content (strip *. prefix — dnsmasq covers all subdomains automatically)
    const addressLines = domains
      .map((d) => `address=/${d.replace(/^\*\./, "")}/127.0.0.1`)
      .join("\n");
    const confContent = `${addressLines}\n`;

    // Write config file
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const brewPrefix = await runCommand("brew", ["--prefix"], logger, 10_000);
    if (brewPrefix.code !== 0) {
      item.status = "failed";
      item.message = "Failed to resolve brew prefix";
      return item;
    }
    const confDir = `${brewPrefix.stdout.trim()}/etc/dnsmasq.d`;
    if (!existsSync(confDir)) {
      mkdirSync(confDir, { recursive: true });
    }
    writeFileSync(`${confDir}/sandbox-domains.conf`, confContent, "utf-8");

    // Restart/start dnsmasq — try multiple approaches, verify with pgrep
    let started = false;

    // Approach 1: brew services restart
    const restart1 = await runCommand("brew", ["services", "restart", "dnsmasq"], logger, 15_000).catch(() => null);
    if (restart1 && restart1.code === 0) {
      await new Promise((r) => setTimeout(r, 2000));
      const verify1 = await runCommand("pgrep", ["-x", "dnsmasq"], logger, 5_000).catch(() => null);
      if (verify1 && verify1.stdout.trim().length > 0) {
        started = true;
      }
    }

    // Approach 2: kill existing then brew services start
    if (!started) {
      await runCommand("sh", ["-c", "pkill dnsmasq 2>/dev/null || true"], logger, 5_000).catch(() => null);
      const start2 = await runCommand("brew", ["services", "start", "dnsmasq"], logger, 15_000).catch(() => null);
      if (start2 && start2.code === 0) {
        await new Promise((r) => setTimeout(r, 2000));
        const verify2 = await runCommand("pgrep", ["-x", "dnsmasq"], logger, 5_000).catch(() => null);
        if (verify2 && verify2.stdout.trim().length > 0) {
          started = true;
        }
      }
    }

    // Check which parts still need manual setup
    const needsManual: string[] = [];

    // Check resolver files (needs sudo, cannot automate)
    for (const d of domains) {
      const resolverName = d.replace(/^\*\./, "");
      const res = await runCommand(
        "sh",
        ["-c", `test -f /etc/resolver/${resolverName} && grep -q 'nameserver 127.0.0.1' /etc/resolver/${resolverName} && echo yes || echo no`],
        logger,
        5_000,
      ).catch(() => null);
      if (!res || !res.stdout.includes("yes")) {
        needsManual.push(resolverName);
      }
    }

    if (!started) {
      needsManual.push("start service (sudo brew services restart dnsmasq)");
    }

    if (needsManual.length > 0) {
      item.status = "failed";
      item.message = `Config written. Needs manual: ${needsManual.join(", ")}`;
      return item;
    }

    item.status = "passed";
    item.message = `Running, configured for: ${domains.join(", ")}`;
  } catch (err) {
    item.status = "failed";
    item.message = `Dnsmasq setup error: ${err instanceof Error ? err.message : String(err)}`;
  }

  return item;
}
