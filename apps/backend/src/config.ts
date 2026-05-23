// Environment-driven configuration — no external validation dependency required

export interface Config {
  port: number;
  nodeEnv: string;

  // OpenSandbox
  osbServerUrl: string;
  osbApiKey: string;
  osbProtocol: "http" | "https";
  osbUseServerProxy: boolean;
  osbRequestTimeoutSeconds: number;
  configured: boolean;

  // CORS
  corsOrigin: string;

  // Logging
  logLevel: string;

  // PTY relay
  ptyIdleTimeoutMs: number;
}

export interface SetupConfig {
  osbServerUrl: string;
  osbApiKey: string;
  osbProtocol: "http" | "https";
  k8sMode: "local" | "remote";
}

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) throw new Error(`Invalid integer for ${key}: ${raw}`);
  return parsed;
}

export function loadConfig(): Config {
  const osbServerUrl = getEnv("OPENSANDBOX_SERVER_URL", "");
  const osbApiKey = getEnv("OPENSANDBOX_API_KEY", "");
  const configured = osbServerUrl.length > 0 && osbApiKey.length > 0;

  return Object.freeze({
    port: getEnvInt("PORT", 3000),
    nodeEnv: getEnv("NODE_ENV", "development"),

    osbServerUrl,
    osbApiKey,
    osbProtocol: (getEnv("OPENSANDBOX_PROTOCOL", "http") as "http" | "https"),
    osbUseServerProxy: getEnv("OPENSANDBOX_USE_SERVER_PROXY", "true") === "true",
    osbRequestTimeoutSeconds: getEnvInt("OPENSANDBOX_REQUEST_TIMEOUT_SECONDS", 300),
    configured,

    corsOrigin: getEnv("CORS_ORIGIN", "*"),

    logLevel: getEnv("LOG_LEVEL", "info"),

    ptyIdleTimeoutMs: getEnvInt("PTY_IDLE_TIMEOUT_MS", 300000),
  });
}
