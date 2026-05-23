import { runCommand } from "../utils/runCommand.js";
import type { Logger } from "../logger.js";
import type { ImageInfo, CachedImage } from "../types/index.js";

const NAMESPACE = "opensandbox-images";
const MANAGED_BY_LABEL = "opensandbox-manager";

/**
 * Sanitize an image reference into a valid Kubernetes resource name.
 * e.g. "rabbitai-lab/code-sandbox:latest" → "pull-rabbitai-lab-code-sandbox-latest"
 */
function sanitizeImageName(image: string): string {
  const name = image
    .replace(/[:/@.]/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const prefixed = `pull-${name}`;
  // K8s name limit is 63 characters
  return prefixed.length > 63 ? prefixed.slice(0, 63).replace(/-+$/, "") : prefixed;
}

/**
 * Derive a display name from the image reference.
 * e.g. "rabbitai-lab/code-sandbox:latest" → "code-sandbox:latest"
 */
function deriveDisplayName(image: string): string {
  const parts = image.split("/");
  const last = parts[parts.length - 1] || image;
  return last;
}

/**
 * Parse DaemonSet JSON into an ImageInfo.
 * When podErrors map is provided, enrich error messages from Pod container statuses.
 */
function parseDaemonSetToImageInfo(
  ds: Record<string, unknown>,
  podErrors?: Map<string, string>,
): ImageInfo {
  const metadata = ds.metadata as Record<string, unknown>;
  const status = ds.status as Record<string, unknown>;
  const labels = metadata.labels as Record<string, string> | undefined;

  const annotations = metadata.annotations as Record<string, string> | undefined;
  // Prefer original image from annotation (un-sanitized), fall back to label
  const image = annotations?.["opensandbox.io/original-image"] ?? labels?.["opensandbox.io/image"] ?? String(metadata.name ?? "");
  const daemonSetName = String(metadata.name ?? "");
  const desired = Number(status.desiredNumberScheduled ?? 0);
  const ready = Number(status.numberReady ?? 0);
  const unavailable = Number(status.numberUnavailable ?? 0);

  let imgStatus: ImageInfo["status"] = "pulling";
  let message: string | undefined;

  if (desired > 0 && ready === desired) {
    imgStatus = "ready";
  } else if (desired > 0 && unavailable > 0) {
    // Check Pod-level errors from containerStatuses
    const podError = podErrors?.get(daemonSetName);
    if (podError) {
      if (
        podError.includes("ImagePullBackOff") ||
        podError.includes("ErrImagePull") ||
        podError.includes("CrashLoopBackOff")
      ) {
        imgStatus = "error";
        message = podError;
      }
      // Otherwise still pulling (e.g. "ContainerCreating")
    } else {
      // Fallback: check DaemonSet conditions
      const conditions = status.conditions as Array<Record<string, unknown>> | undefined;
      const conditionMsg = conditions?.find((c) => c.type === "DaemonSetProgressing")?.message as string | undefined;
      if (conditionMsg?.includes("ImagePullBackOff") || conditionMsg?.includes("ErrImagePull")) {
        imgStatus = "error";
        message = conditionMsg;
      }
    }
  }

  return {
    name: deriveDisplayName(image),
    image,
    status: imgStatus,
    daemonSetName,
    createdAt: String(metadata.creationTimestamp ?? ""),
    nodesReady: ready,
    nodesTotal: desired,
    message,
  };
}

export class ImageService {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Ensure the opensandbox-images namespace exists.
   */
  async ensureNamespace(): Promise<void> {
    const result = await runCommand(
      "sh",
      ["-c", `kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -`],
      this.logger,
      15_000,
    );
    if (result.code !== 0 && !result.stderr.includes("AlreadyExists")) {
      throw new Error(`Failed to create namespace ${NAMESPACE}: ${result.stderr.trim()}`);
    }
    this.logger.debug({ namespace: NAMESPACE }, "Namespace ensured");
  }

  /**
   * Collect Pod error reasons for DaemonSets in the namespace.
   * Returns a map of daemonSetName → first error reason from containerStatuses.
   */
  private async collectPodErrors(): Promise<Map<string, string>> {
    const errorMap = new Map<string, string>();
    try {
      const result = await runCommand(
        "kubectl",
        ["get", "pods", "-n", NAMESPACE, "-o", "json"],
        this.logger,
        30_000,
      );
      if (result.code !== 0) return errorMap;

      const data = JSON.parse(result.stdout) as {
        items: Array<{
          metadata: { name: string; labels?: Record<string, string> };
          status: {
            phase: string;
            containerStatuses?: Array<{
              state: {
                waiting?: { reason: string; message?: string };
                terminated?: { reason: string };
              };
            }>;
            initContainerStatuses?: Array<{
              state: {
                waiting?: { reason: string; message?: string };
                terminated?: { reason: string };
              };
            }>;
          };
        }>;
      };

      for (const pod of data.items ?? []) {
        const podName = pod.metadata.name;
        // Extract DaemonSet name from pod name (pod name format: <ds-name>-<random-suffix>)
        // Find the longest matching DaemonSet label
        const appLabel = pod.metadata.labels?.["app"];
        if (!appLabel) continue;

        // Check initContainer statuses first (for image pull errors)
        for (const cs of pod.status.initContainerStatuses ?? []) {
          const waiting = cs.state?.waiting;
          if (waiting?.reason) {
            const detail = waiting.message
              ? `${waiting.reason}: ${waiting.message}`
              : waiting.reason;
            errorMap.set(appLabel, detail);
            break;
          }
        }

        // Check container statuses
        if (!errorMap.has(appLabel)) {
          for (const cs of pod.status.containerStatuses ?? []) {
            const waiting = cs.state?.waiting;
            if (waiting?.reason) {
              const detail = waiting.message
                ? `${waiting.reason}: ${waiting.message}`
                : waiting.reason;
              errorMap.set(appLabel, detail);
              break;
            }
          }
        }
      }
    } catch {
      // Non-fatal — Pod errors are enrichment, not critical
    }
    return errorMap;
  }

  /**
   * List all pre-pulled images (managed DaemonSets).
   */
  async listImages(): Promise<ImageInfo[]> {
    try {
      const result = await runCommand(
        "kubectl",
        [
          "get", "daemonsets",
          "-n", NAMESPACE,
          "-l", `app.kubernetes.io/managed-by=${MANAGED_BY_LABEL}`,
          "-o", "json",
        ],
        this.logger,
        30_000,
      );

      if (result.code !== 0) {
        this.logger.warn({ stderr: result.stderr.trim() }, "Failed to list image DaemonSets");
        return [];
      }

      const data = JSON.parse(result.stdout) as { items: Record<string, unknown>[] };
      const podErrors = await this.collectPodErrors();
      return (data.items ?? []).map((ds) => parseDaemonSetToImageInfo(ds, podErrors));
    } catch (err) {
      this.logger.error({ err: err instanceof Error ? err.message : String(err) }, "Failed to list images");
      return [];
    }
  }

  /**
   * Pull (pre-cache) an image on all cluster nodes by creating a DaemonSet.
   */
  async pullImage(image: string): Promise<ImageInfo> {
    this.logger.info({ image }, "Pulling image to cluster");

    await this.ensureNamespace();

    const sanitized = sanitizeImageName(image);
    const imageLabelValue = image.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "image";

    const manifest = `apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: ${sanitized}
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/managed-by: ${MANAGED_BY_LABEL}
    opensandbox.io/image: "${imageLabelValue}"
  annotations:
    opensandbox.io/original-image: "${image}"
spec:
  selector:
    matchLabels:
      app: ${sanitized}
  template:
    metadata:
      labels:
        app: ${sanitized}
    spec:
      initContainers:
      - name: puller
        image: ${image}
        imagePullPolicy: Always
        command: ["true"]
      containers:
      - name: pause
        image: registry.k8s.io/pause:3.9
        resources:
          limits:
            cpu: 10m
            memory: 16Mi
          requests:
            cpu: 5m
            memory: 8Mi
      terminationGracePeriodSeconds: 1
`;

    const result = await runCommand(
      "sh",
      ["-c", `echo '${manifest.replace(/'/g, "'\\''")}' | kubectl apply -f -`],
      this.logger,
      60_000,
    );

    if (result.code !== 0) {
      throw new Error(`Failed to create DaemonSet for image ${image}: ${result.stderr.trim()}`);
    }

    this.logger.info({ image, daemonSet: sanitized }, "Image pull DaemonSet created");

    return {
      name: deriveDisplayName(image),
      image,
      status: "pulling",
      daemonSetName: sanitized,
      createdAt: new Date().toISOString(),
      nodesReady: 0,
      nodesTotal: 0,
    };
  }

  /**
   * Get the pull status of a specific image DaemonSet.
   */
  async getImageStatus(name: string): Promise<ImageInfo> {
    const result = await runCommand(
      "kubectl",
      ["get", "daemonset", name, "-n", NAMESPACE, "-o", "json"],
      this.logger,
      15_000,
    );

    if (result.code !== 0) {
      if (result.stderr.includes("not found") || result.stderr.includes("NotFound")) {
        throw new Error(`Image DaemonSet "${name}" not found`);
      }
      throw new Error(`Failed to get DaemonSet ${name}: ${result.stderr.trim()}`);
    }

    const ds = JSON.parse(result.stdout) as Record<string, unknown>;
    const podErrors = await this.collectPodErrors();
    return parseDaemonSetToImageInfo(ds, podErrors);
  }

  /**
   * Delete a pre-pulled image (remove the DaemonSet).
   */
  async deleteImage(name: string): Promise<void> {
    this.logger.info({ daemonSet: name }, "Deleting image DaemonSet");
    const result = await runCommand(
      "kubectl",
      ["delete", "daemonset", name, "-n", NAMESPACE],
      this.logger,
      30_000,
    );

    if (result.code !== 0) {
      if (result.stderr.includes("not found") || result.stderr.includes("NotFound")) {
        throw new Error(`Image DaemonSet "${name}" not found`);
      }
      throw new Error(`Failed to delete DaemonSet ${name}: ${result.stderr.trim()}`);
    }

    this.logger.info({ daemonSet: name }, "Image DaemonSet deleted");
  }

  /**
   * List all images cached on cluster nodes.
   */
  async listCachedImages(): Promise<CachedImage[]> {
    try {
      const result = await runCommand(
        "kubectl",
        ["get", "nodes", "-o", "json"],
        this.logger,
        30_000,
      );

      if (result.code !== 0) {
        this.logger.warn({ stderr: result.stderr.trim() }, "Failed to list cached images");
        return [];
      }

      const data = JSON.parse(result.stdout) as {
        items: Array<{
          metadata: { name: string };
          status: { images?: Array<{ names?: string[]; sizeBytes?: number }> };
        }>;
      };

      const cached: CachedImage[] = [];
      for (const node of data.items ?? []) {
        const nodeName = node.metadata.name;
        for (const img of node.status.images ?? []) {
          for (const name of img.names ?? []) {
            cached.push({
              image: name,
              node: nodeName,
              sizeBytes: img.sizeBytes,
            });
          }
        }
      }

      return cached;
    } catch (err) {
      this.logger.error({ err: err instanceof Error ? err.message : String(err) }, "Failed to list cached images");
      return [];
    }
  }
}
