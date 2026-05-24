import type { Logger } from "../logger.js";
import { runCommand } from "../utils/runCommand.js";

export interface SetupProgressEvent {
  step: string;
  stepLabel: string;
  status: "running" | "success" | "error";
  output?: string;
  progress: number;
}

type EventSink = (event: SetupProgressEvent) => void;

interface Step {
  step: string;
  label: string;
  weight: number;
  run: () => Promise<void>;
}

/**
 * InfraRunner executes the full local K8s installation pipeline.
 * Each step emits progress events through the provided sink.
 */
export class InfraRunner {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Run the full local K8s setup pipeline, emitting progress events.
   */
  async runLocalK8sSetup(eventSink: EventSink): Promise<void> {
    const steps = this.buildSteps(eventSink);
    let progress = 0;

    for (const step of steps) {
      eventSink({
        step: step.step,
        stepLabel: step.label,
        status: "running",
        progress: Math.round(progress),
      });

      try {
        await step.run();
        progress += step.weight;
        eventSink({
          step: step.step,
          stepLabel: step.label,
          status: "success",
          progress: Math.round(progress),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        eventSink({
          step: step.step,
          stepLabel: step.label,
          status: "error",
          output: message,
          progress: Math.round(progress),
        });
        throw err;
      }
    }
  }

  private buildSteps(eventSink: EventSink): Step[] {
    const emitOutput = (step: string, label: string, output: string, progress: number) => {
      eventSink({ step, stepLabel: label, status: "running", output, progress });
    };

    return [
      {
        step: "prerequisites",
        label: "Checking prerequisites...",
        weight: 5,
        run: async () => {
          // Check kubectl — use --client without --short (deprecated in newer versions)
          const kubectl = await runCommand("kubectl", ["version", "--client"], this.logger, 15_000).catch(() => null);
          if (!kubectl || kubectl.code !== 0) {
            throw new Error("kubectl not found or not working. Please ensure kubectl is installed and in PATH.");
          }
          emitOutput("prerequisites", "Checking prerequisites...", "kubectl: OK", 2);

          // Check helm — install if missing
          const helm = await runCommand("helm", ["version", "--short"], this.logger, 15_000).catch(() => null);
          if (!helm || helm.code !== 0) {
            emitOutput("prerequisites", "Checking prerequisites...", "helm not found, installing via script...", 3);
            const installResult = await runCommand(
              "sh",
              ["-c", "curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | sh"],
              this.logger,
              120_000,
            );
            if (installResult.code !== 0) {
              throw new Error(`Failed to install helm: ${installResult.stderr.trim()}`);
            }
            emitOutput("prerequisites", "Checking prerequisites...", "helm: installed", 4);
          } else {
            emitOutput("prerequisites", "Checking prerequisites...", `helm: ${helm.stdout.trim()}`, 4);
          }
        },
      },
      {
        step: "cluster",
        label: "Checking Kubernetes cluster...",
        weight: 5,
        run: async () => {
          const result = await runCommand("kubectl", ["cluster-info"], this.logger, 15_000);
          if (result.code !== 0) {
            throw new Error("Kubernetes cluster not reachable. Ensure Docker Desktop K8s is running.");
          }
          emitOutput("cluster", "Checking Kubernetes cluster...", "Cluster is reachable", 10);
        },
      },
      {
        step: "namespaces",
        label: "Creating namespaces...",
        weight: 5,
        run: async () => {
          // Create namespaces using sh -c with pipe — shell must handle the pipe
          const ns1 = await runCommand(
            "sh",
            ["-c", "kubectl create namespace opensandbox-system --dry-run=client -o yaml | kubectl apply -f -"],
            this.logger,
          );
          const ns2 = await runCommand(
            "sh",
            ["-c", "kubectl create namespace opensandbox --dry-run=client -o yaml | kubectl apply -f -"],
            this.logger,
          );
          if (ns1.code !== 0 && !ns1.stderr.includes("AlreadyExists")) {
            throw new Error(`Failed to create namespace opensandbox-system: ${ns1.stderr.trim()}`);
          }
          if (ns2.code !== 0 && !ns2.stderr.includes("AlreadyExists")) {
            throw new Error(`Failed to create namespace opensandbox: ${ns2.stderr.trim()}`);
          }
          emitOutput("namespaces", "Creating namespaces...", "Namespaces ready", 15);
        },
      },
      {
        step: "clone-chart",
        label: "Downloading OpenSandbox Helm chart...",
        weight: 10,
        run: async () => {
          const { execSync } = await import("node:child_process");
          // Remove old clone if present
          try { execSync("rm -rf /tmp/opensandbox-chart", { stdio: "ignore" }); } catch { /* ignore */ }

          const result = await runCommand(
            "git",
            ["clone", "--depth", "1", "https://github.com/alibaba/OpenSandbox.git", "/tmp/opensandbox-chart"],
            this.logger,
            120_000,
          );
          if (result.code !== 0) {
            throw new Error(`Failed to clone chart: ${result.stderr.trim()}`);
          }
          emitOutput("clone-chart", "Downloading OpenSandbox Helm chart...", "Chart downloaded", 25);
        },
      },
      {
        step: "helm-uninstall",
        label: "Removing previous OpenSandbox installation...",
        weight: 5,
        run: async () => {
          const checkResult = await runCommand(
            "helm",
            ["status", "opensandbox-controller", "-n", "opensandbox-system"],
            this.logger,
            10_000,
          ).catch(() => null);

          if (!checkResult || checkResult.code !== 0) {
            emitOutput("helm-uninstall", "Removing previous OpenSandbox installation...", "No previous installation found, skipping", 27);
            return;
          }

          emitOutput("helm-uninstall", "Removing previous OpenSandbox installation...", "Running helm uninstall...", 27);
          await runCommand(
            "helm",
            ["uninstall", "opensandbox-controller", "-n", "opensandbox-system"],
            this.logger,
            60_000,
          );

          // Wait for all pods to terminate
          emitOutput("helm-uninstall", "Removing previous OpenSandbox installation...", "Waiting for pods to terminate...", 27);
          for (let i = 0; i < 30; i++) {
            const podCheck = await runCommand(
              "sh",
              ["-c", "kubectl get pods -n opensandbox-system -o jsonpath='{.items[*].status.phase}' 2>/dev/null"],
              this.logger,
              5_000,
            ).catch(() => null);
            const phases = podCheck?.stdout?.trim() ?? "";
            if (phases.length === 0) {
              break;
            }
            await new Promise((r) => setTimeout(r, 2000));
          }
        },
      },
      {
        step: "helm-install",
        label: "Installing OpenSandbox (this may take a few minutes)...",
        weight: 40,
        run: async () => {
          // Determine chart directory
          let chartDir = "/tmp/opensandbox-chart";
          const { existsSync } = await import("node:fs");
          if (existsSync("/tmp/opensandbox-chart/kubernetes/charts/opensandbox")) {
            chartDir = "/tmp/opensandbox-chart/kubernetes/charts/opensandbox";
          } else if (existsSync("/tmp/opensandbox-chart/deploy/charts/opensandbox")) {
            chartDir = "/tmp/opensandbox-chart/deploy/charts/opensandbox";
          } else if (existsSync("/tmp/opensandbox-chart/charts/opensandbox")) {
            chartDir = "/tmp/opensandbox-chart/charts/opensandbox";
          }

          // Build chart dependencies first
          emitOutput("helm-install", "Fetching chart dependencies...", "Running helm dependency build...", 28);
          const depResult = await runCommand(
            "helm",
            ["dependency", "build", chartDir],
            this.logger,
            120_000,
            (chunk) => {
              const lines = chunk.trim();
              if (lines) {
                emitOutput("helm-install", "Fetching chart dependencies...", lines, 28);
              }
            },
          );
          if (depResult.code !== 0) {
            throw new Error(`Helm dependency build failed: ${depResult.stderr.trim()}`);
          }

          emitOutput("helm-install", "Installing OpenSandbox...", "Running helm install...", 33);

          // Write a temporary values file with gateway wildcard config
          const { writeFileSync, unlinkSync } = await import("node:fs");
          const tmpValues = "/tmp/opensandbox-setup-values.yaml";
          writeFileSync(tmpValues, `opensandbox-server:
  server:
    gateway:
      enabled: true
      host: "*.sandbox.localhost"
      gatewayRouteMode: "wildcard"
  configToml: |
    [server]
    host = "0.0.0.0"
    port = 80
    api_key = "dev-api-key-change-in-prod"

    [log]
    level = "INFO"

    [runtime]
    type = "kubernetes"
    execd_image = "sandbox-registry.cn-zhangjiakou.cr.aliyuncs.com/opensandbox/execd:v1.0.17"

    [kubernetes]
    kubeconfig_path = ""
    namespace = "opensandbox"
    informer_enabled = true
    workload_provider = "batchsandbox"

    [egress]
    image = "sandbox-registry.cn-zhangjiakou.cr.aliyuncs.com/opensandbox/egress:v1.0.12"
    mode = "dns+nft"

opensandbox-controller:
  controller:
    snapshot:
      containerdSocketPath: ""
`, "utf-8");

          const result = await runCommand(
            "helm",
            [
              "install",
              "opensandbox-controller",
              chartDir,
              "-n",
              "opensandbox-system",
              "-f", tmpValues,
              "--wait",
              "--timeout",
              "300s",
            ],
            this.logger,
            360_000, // 6 minute timeout for helm
            (chunk) => {
              // Stream helm output to the frontend in real-time
              const lines = chunk.trim();
              if (lines) {
                emitOutput("helm-install", "Installing OpenSandbox...", lines, 30);
              }
            },
          );

          // Cleanup temp file
          try { unlinkSync(tmpValues); } catch { /* ignore */ }

          if (result.code !== 0) {
            throw new Error(`Helm install failed: ${result.stderr.trim()}`);
          }
          emitOutput("helm-install", "Installing OpenSandbox...", "Helm install complete", 55);
        },
      },
      {
        step: "post-install",
        label: "Configuring gateway and ingress...",
        weight: 10,
        run: async () => {
          // Patch ingress gateway --mode from wildcard (server route mode) to header (gateway discovery mode)
          // Helm chart template reuses gatewayRouteMode for both Server config and Gateway --mode flag,
          // but the Gateway binary only supports "header" mode for service discovery.
          emitOutput("post-install", "Configuring gateway mode...", "Patching ingress gateway --mode=header...", 57);
          await runCommand(
            "kubectl",
            [
              "patch", "deployment", "opensandbox-ingress-gateway",
              "-n", "opensandbox-system",
              "--type=json",
              "-p", `[{"op":"replace","path":"/spec/template/spec/containers/0/args","value":["--namespace=opensandbox","--port=28888","--provider-type=batchsandbox","--mode=header","--log-level=info"]}]`,
            ],
            this.logger,
            30_000,
          );

          // Apply sandbox ingress rules
          emitOutput("post-install", "Applying ingress rules...", "Creating K8s Ingress rules...", 60);
          const { existsSync } = await import("node:fs");
          const projectRoot = new URL("../../../..", import.meta.url).pathname.replace(/\/$/, "");
          const ingressFiles = ["sandbox-ingress.yaml", "server-ingress.yaml"];
          for (const f of ingressFiles) {
            const p = `${projectRoot}/infra/opensandbox/${f}`;
            if (existsSync(p)) {
              await runCommand("kubectl", ["apply", "-f", p], this.logger, 15_000);
            }
          }

          emitOutput("post-install", "Configuring gateway and ingress...", "Post-install configuration complete", 65);
        },
      },
      {
        step: "wait-pods",
        label: "Waiting for pods to be ready...",
        weight: 10,
        run: async () => {
          const result = await runCommand(
            "kubectl",
            [
              "wait",
              "--for=condition=ready",
              "pod",
              "-l", "app.kubernetes.io/instance=opensandbox-controller",
              "-n", "opensandbox-system",
              "--timeout=180s",
            ],
            this.logger,
            200_000,
          );
          if (result.code !== 0) {
            emitOutput("wait-pods", "Waiting for pods...", `Warning: ${result.stderr.trim()}`, 75);
            // Non-fatal: pods may still be starting
          } else {
            emitOutput("wait-pods", "Waiting for pods...", "Pods are ready", 80);
          }
        },
      },
      {
        step: "pool",
        label: "Deploying sandbox pool...",
        weight: 5,
        run: async () => {
          // Wait for CRD to be registered
          for (let i = 0; i < 30; i++) {
            const check = await runCommand(
              "kubectl",
              ["get", "crd", "pools.sandbox.opensandbox.io"],
              this.logger,
              5_000,
            ).catch(() => null);
            if (check && check.code === 0) break;
            await new Promise((r) => setTimeout(r, 2000));
          }

          // Apply pool from infra/opensandbox/pool.yaml or inline
          const poolYaml = `apiVersion: sandbox.opensandbox.io/v1alpha1
kind: Pool
metadata:
  name: dev-pool
  namespace: opensandbox
spec:
  template:
    spec:
      containers:
      - name: sandbox
        image: ghcr.io/rabbitai-lab/claude-code:latest
        command: ["sleep", "infinity"]
  capacitySpec:
    bufferMax: 3
    bufferMin: 1
    poolMax: 5
    poolMin: 0
`;
          const result = await runCommand(
            "sh",
            ["-c", `echo '${poolYaml.replace(/'/g, "'\\''")}' | kubectl apply -f -`],
            this.logger,
            30_000,
          );
          if (result.code !== 0) {
            emitOutput("pool", "Deploying sandbox pool...", `Warning: ${result.stderr.trim()}`, 82);
          } else {
            emitOutput("pool", "Deploying sandbox pool...", "Pool deployed", 85);
          }
        },
      },
      {
        step: "verify-gateway",
        label: "Verifying gateway access...",
        weight: 15,
        run: async () => {
          // Kill any stale port-forward processes
          try {
            await runCommand("sh", ["-c", "pkill -f 'port-forward.*opensandbox' || true"], this.logger, 5_000);
          } catch { /* ignore */ }

          emitOutput("verify-gateway", "Verifying gateway access...", "Checking http://osb.sandbox.localhost/health...", 90);
          const healthResult = await runCommand(
            "curl",
            ["-s", "http://osb.sandbox.localhost/health"],
            this.logger,
            10_000,
          );
          if (healthResult.code !== 0 || !healthResult.stdout.includes("healthy")) {
            emitOutput("verify-gateway", "Verifying gateway access...", "Warning: Server health check failed (may need Ingress rules applied)", 92);
          } else {
            emitOutput("verify-gateway", "Verifying gateway access...", "Server health check passed", 95);
          }

          emitOutput("verify-gateway", "Verifying gateway access...", "Gateway ready", 100);
        },
      },
    ];
  }
}
