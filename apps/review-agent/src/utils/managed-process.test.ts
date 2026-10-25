import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { spawnManagedProcess } from "./managed-process";

const stubbornChild = `process.on("SIGTERM", () => {}); console.log("READY:" + process.pid); setInterval(() => {}, 1000);`;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    if (process.platform === "linux") {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      return stat.slice(stat.lastIndexOf(")") + 2)[0] !== "Z";
    }
    return true;
  } catch (error) {
    if (["ESRCH", "ENOENT"].includes((error as NodeJS.ErrnoException).code ?? "")) {
      return false;
    }
    throw error;
  }
}

async function eventually(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() >= deadline) {
      throw new Error("Condition did not become true");
    }
    await delay(10);
  }
}

function readReady(child: ReturnType<typeof spawn>): Promise<number> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`Child not ready: ${output}`)), 3000);
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString();
      const match = output.match(/READY:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

describe.skipIf(process.platform === "win32")("managed process shutdown", () => {
  it("waits for graceful shutdown and makes concurrent stop calls idempotent", async () => {
    const child = spawnManagedProcess(process.execPath, [
      "-e",
      `console.log("READY:" + process.pid); setInterval(() => {}, 1000);`,
    ]);
    try {
      const pid = await readReady(child.process);
      const first = child.stop();
      expect(child.stop()).toBe(first);
      await first;
      expect(isAlive(pid)).toBe(false);
    } finally {
      await child.stop();
    }
  });

  it("escalates to SIGKILL when SIGTERM is ignored", async () => {
    const child = spawnManagedProcess(process.execPath, ["-e", stubbornChild], {
      shutdownGraceMs: 100,
      killTimeoutMs: 2000,
    });
    try {
      const pid = await readReady(child.process);
      await child.stop();
      expect(isAlive(pid)).toBe(false);
      expect(child.process.signalCode).toBe("SIGKILL");
    } finally {
      await child.stop();
    }
  });

  it("kills descendants even after their launcher has already exited", async () => {
    const launcher = `
      const {spawn} = require("node:child_process");
      const child = spawn(process.execPath, ["-e", ${JSON.stringify(stubbornChild)}], {stdio: ["ignore", "pipe", "inherit"]});
      child.stdout.once("data", (data) => { process.stdout.write(data); process.exit(0); });
    `;
    const child = spawnManagedProcess(process.execPath, ["-e", launcher], {
      shutdownGraceMs: 100,
      killTimeoutMs: 2000,
    });
    try {
      const descendantPid = await readReady(child.process);
      await eventually(() => child.process.exitCode === 0);
      expect(isAlive(descendantPid)).toBe(true);
      await child.stop();
      expect(isAlive(descendantPid)).toBe(false);
    } finally {
      await child.stop();
    }
  });

  for (const termination of ["SIGTERM", "SIGINT", "exit"] as const) {
    it(`cleans up children when the agent receives ${termination}`, async () => {
      const modulePath = new URL("./managed-process.ts", import.meta.url).pathname;
      const source = `
        const {spawnManagedProcess} = await import(${JSON.stringify(modulePath)});
        const child = spawnManagedProcess(process.execPath, ["-e", ${JSON.stringify(stubbornChild)}], {shutdownGraceMs: 100, killTimeoutMs: 2000});
        child.process.stdout.once("data", (data) => {
          process.stdout.write(data);
          ${termination === "exit" ? "process.exit(42);" : ""}
        });
      `;
      const agent = spawn(process.execPath, ["-e", source]);
      let pid: number | undefined;
      try {
        pid = await readReady(agent);
        if (termination !== "exit") {
          agent.kill(termination);
        }
        await eventually(() => agent.exitCode !== null);
        await eventually(() => !isAlive(pid as number));
        expect(agent.exitCode).toBe(
          termination === "exit" ? 42 : termination === "SIGTERM" ? 143 : 130
        );
      } finally {
        agent.kill("SIGKILL");
        if (pid && isAlive(pid)) {
          process.kill(pid, "SIGKILL");
        }
      }
    });
  }
});
