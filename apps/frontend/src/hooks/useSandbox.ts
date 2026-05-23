import { useState, useEffect, useCallback } from "react";
import { useSandboxStore } from "@/stores/sandboxStore";
import { getSandbox } from "@/api/sandboxes";
import type { Sandbox } from "@/api/types";

export function useSandbox(sandboxId: string) {
  const [sandbox, setSandbox] = useState<Sandbox | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const storeSandboxes = useSandboxStore((s) => s.sandboxes);

  const refresh = useCallback(async () => {
    try {
      const sb = await getSandbox(sandboxId);
      setSandbox(sb);
      setError(null);
      return sb;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, [sandboxId]);

  useEffect(() => {
    // Always fetch fresh — don't trust store cache as sandboxes can expire
    setLoading(true);
    setError(null);

    getSandbox(sandboxId)
      .then((sb) => {
        setSandbox(sb);
        setLoading(false);
      })
      .catch((err) => {
        setError((err as Error).message);
        setSandbox(null); // Clear stale data so error page renders
        setLoading(false);
      });
  }, [sandboxId]);

  // Auto-poll when Creating
  useEffect(() => {
    if (!sandbox || (sandbox.status !== "Creating" && sandbox.status !== "Pausing" && sandbox.status !== "Resuming")) {
      return;
    }

    const interval = setInterval(async () => {
      const sb = await refresh();
      if (sb && sb.status !== "Creating" && sb.status !== "Pausing" && sb.status !== "Resuming") {
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [sandbox?.status, refresh]);

  return { sandbox, loading, error, refresh };
}
