import type { ApiErrorResponse, ApiSuccessResponse } from "./types";

const API_BASE = "/api";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json();

  if (!res.ok || data.success === false) {
    const err = (data as ApiErrorResponse).error;
    throw new ApiError(err?.code ?? "UNKNOWN", err?.message ?? "Request failed", res.status);
  }

  return (data as ApiSuccessResponse<T>).data;
}
