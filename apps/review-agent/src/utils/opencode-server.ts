import { createOpencodeClient } from "@opencode-ai/sdk";
import { spawnManagedProcess } from "./managed-process";

const OUTPUT_LIMIT = 16_384;

export async function createManagedOpencode(options: {
  port: number;
  timeout: number;
  config: Record<string, unknown>;
}) {
  const managed = spawnManagedProcess(
    "opencode",
    [
      "serve",
      "--hostname=127.0.0.1",
      `--port=${options.port}`,
      ...(typeof options.config.logLevel === "string"
        ? [`--log-level=${options.config.logLevel}`]
        : []),
    ],
    {
      env: { ...process.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(options.config) },
    }
  );
  const child = managed.process;

  try {
    const url = await new Promise<string>((resolve, reject) => {
      let output = "";
      let pendingLine = "";
      let started = false;
      const timeout = setTimeout(() => {
        reject(
          new Error(`Timeout waiting for OpenCode server to start after ${options.timeout}ms`)
        );
      }, options.timeout);

      child.stdout.on("data", (chunk: Buffer) => {
        if (started) {
          return;
        }
        const text = chunk.toString();
        output = (output + text).slice(-OUTPUT_LIMIT);
        pendingLine = (pendingLine + text).slice(-OUTPUT_LIMIT);
        const lines = pendingLine.split("\n");
        pendingLine = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("opencode server listening")) {
            continue;
          }
          const match = line.match(/\bon\s+(https?:\/\/[^\s]+)/);
          if (!match) {
            clearTimeout(timeout);
            reject(new Error("Invalid OpenCode server listening address"));
            return;
          }
          started = true;
          clearTimeout(timeout);
          resolve(match[1]);
          return;
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        output = (output + chunk.toString()).slice(-OUTPUT_LIMIT);
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code, signal) => {
        clearTimeout(timeout);
        if (started) {
          console.log(`OpenCode process exited: pid=${child.pid}, code=${code}, signal=${signal}`);
        } else {
          reject(new Error(`OpenCode server exited: code=${code}, signal=${signal}\n${output}`));
        }
      });
    });

    return {
      client: createOpencodeClient({ baseUrl: url }),
      server: { url, close: () => managed.stop() },
    };
  } catch (error) {
    await managed.stop();
    throw error;
  }
}
