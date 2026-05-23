import pino from "pino";

export function createLogger(level: string) {
  return pino({
    level,
    transport:
      level === "debug"
        ? {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
          }
        : undefined,
  });
}

export type Logger = ReturnType<typeof createLogger>;
