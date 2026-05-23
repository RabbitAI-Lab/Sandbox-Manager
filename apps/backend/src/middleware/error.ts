import type { Request, Response, NextFunction } from "express";
import type { Logger } from "pino";

// Map SDK exceptions to HTTP responses
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const logger = (req.app.locals as { logger: Logger }).logger;
  const requestId = req.headers["x-request-id"] as string | undefined;

  // Classify error by constructor name or properties
  const statusCode = getStatusCode(err);
  const message = err.message || "Internal Server Error";

  logger.error(
    { err, method: req.method, path: req.path, requestId, statusCode },
    "Request error",
  );

  res.status(statusCode).json({
    success: false,
    error: {
      code: `HTTP_${statusCode}`,
      message,
      requestId,
    },
  });
}

function getStatusCode(err: Error): number {
  const name = err.constructor.name;

  if (name === "SandboxApiException" || "statusCode" in err) {
    return (err as unknown as { statusCode: number }).statusCode ?? 502;
  }
  if (name === "SandboxReadyTimeoutException") return 504;
  if (name === "InvalidArgumentException") return 400;
  if (name === "SandboxException" || name === "SandboxInternalException") return 502;

  // Express/json body parser errors
  if ("type" in err && (err as { type: string }).type === "entity.parse.failed") return 400;

  return 500;
}
