import { spawn } from "node:child_process";
import type { Logger } from "../logger.js";

/**
 * Run a command and capture its output.
 */
export function runCommand(
  command: string,
  args: string[],
  logger: Logger,
  timeoutMs = 120_000,
  onOutput?: (chunk: string) => void,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    // When the command is "sh -c <script>", pass the script as a single arg
    // to avoid shell:true re-splitting the -c argument.
    // For other commands, shell:true ensures PATH resolution works.
    const useShell = !(command === "sh" && args[0] === "-c");
    const proc = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: useShell,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      if (onOutput) onOutput(chunk);
    });
    proc.stderr.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      if (onOutput) onOutput(chunk);
    });

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Command timed out: ${command} ${args.join(" ")}`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? 1 });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
