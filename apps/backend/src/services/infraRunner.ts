import { spawn, type ChildProcess } from "node:child_process";
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
  private portForwardProcs: ChildProcess[] = [];
  private manualStop = false;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Start a single port-forward process.
   */
  private startSinglePortForward(
    resource: string,
    localPort: number,
    remotePort: number,
    namespace: string,
  ): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
      const proc = spawn(
        "kubectl",
        ["port-forward", resource, `${localPort}:${remotePort}`, "-n", namespace],
        { stdio: ["ignore", "pipe", "pipe"], detached: false, shell: true, env: process.env },
      );

      let started = false;
      const timer = setTimeout(() => {
        if (!started) {
          proc.kill();
          reject(new Error(`Port-forward ${resource} did not start within 15s`));
        }
      }, 15_000);

      const checkStarted = (data: Buffer) => {
        const msg = data.toString();
        this.logger.debug({ msg: msg.trim() }, "port-forward");
        if (msg.includes("Forwarding") && !started) {
          started = true;
          clearTimeout(timer);
          resolve(proc);
        }
      };

      proc.stdout!.on("data", checkStarted);
      proc.stderr!.on("data", checkStarted);

      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      proc.on("exit", (code) => {
        clearTimeout(timer);
        if (!started) reject(new Error(`Port-forward ${resource} exited with code ${code}`));
      });
    });
  }

  /**
   * Start port-forwards for both server and gateway.
   * Resolves when both are confirmed active.
   */
  async startPortForward(localPort = 8080, remotePort = 80): Promise<void> {
    this.manualStop = false;

    // Kill any existing port-forwards
    try {
      await runCommand("sh", ["-c", "pkill -f 'port-forward.*opensandbox' || true"], this.logger, 5_000);
    } catch { /* ignore */ }
    this.portForwardProcs = [];

    // Start server port-forward
    const serverProc = await this.startSinglePortForward(
      "svc/opensandbox-server", localPort, remotePort, "opensandbox-system",
    );
    this.portForwardProcs.push(serverProc);
    this.logger.info({ localPort }, "Server port-forward active on localhost:%d", localPort);

    // Start gateway port-forward (gateway is needed for sandbox execd access)
    try {
      const gatewayProc = await this.startSinglePortForward(
        "svc/opensandbox-ingress-gateway", 8081, 80, "opensandbox-system",
      );
      this.portForwardProcs.push(gatewayProc);
      this.logger.info("Gateway port-forward active on localhost:8081");

      // Auto-restart all on unexpected exit of either process
      for (const proc of this.portForwardProcs) {
        proc.on("exit", (code, signal) => {
          if (!this.manualStop) {
            this.logger.warn({ code, signal }, "Port-forward exited unexpectedly, restarting in 3s...");
            this.portForwardProcs = [];
            setTimeout(() => {
              this.startPortForward(localPort, remotePort).catch((err) => {
                this.logger.error({ err: err instanceof Error ? err.message : String(err) }, "Failed to restart port-forward");
              });
            }, 3000);
          }
        });
      }
    } catch (err) {
      // Gateway might not exist if not using gateway mode — non-fatal
      this.logger.warn({ err: err instanceof Error ? err.message : String(err) },
        "Gateway port-forward failed (non-fatal, gateway may not be deployed)");
    }
  }

  /**
   * Stop all port-forward child processes.
   */
  stopPortForward(): void {
    this.manualStop = true;
    for (const proc of this.portForwardProcs) {
      if (!proc.killed) proc.kill("SIGTERM");
    }
    this.portForwardProcs = [];
    this.logger.info("Port-forwards stopped");
  }

  /**
   * Get the PID of the first running port-forward process.
   */
  getPortForwardPid(): number | null {
    return this.portForwardProcs[0]?.pid ?? null;
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

          // Check if already installed
          const checkResult = await runCommand(
            "helm",
            ["status", "opensandbox-controller", "-n", "opensandbox-system"],
            this.logger,
            10_000,
          ).catch(() => null);

          const subcommand = checkResult?.code === 0 ? "upgrade" : "install";
          const action = subcommand === "upgrade" ? "Upgrading" : "Installing";

          emitOutput("helm-install", `${action} OpenSandbox...`, `Running helm ${subcommand}...`, 30);

          // Write a temporary values file with the correct config
          const { writeFileSync, unlinkSync } = await import("node:fs");
          const tmpValues = "/tmp/opensandbox-setup-values.yaml";
          writeFileSync(tmpValues, `opensandbox-server:
  server:
    gateway:
      enabled: true
      host: "localhost:8081"
      gatewayRouteMode: "header"
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
              subcommand,
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
                emitOutput("helm-install", `${action} OpenSandbox...`, lines, 30);
              }
            },
          );

          // Cleanup temp file
          try { unlinkSync(tmpValues); } catch { /* ignore */ }

          if (result.code !== 0) {
            throw new Error(`Helm ${subcommand} failed: ${result.stderr.trim()}`);
          }
          emitOutput("helm-install", `${action} OpenSandbox...`, "Helm install complete", 65);
        },
      },
      {
        step: "wait-pods",
        label: "Waiting for pods to be ready...",
        weight: 15,
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
        image: ubuntu:22.04
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
        step: "port-forward",
        label: "Starting port-forward...",
        weight: 15,
        run: async () => {
          await this.startPortForward(8080, 80);
          emitOutput("port-forward", "Starting port-forward...", "Port-forward active on localhost:8080", 100);
        },
      },
    ];
  }
}
