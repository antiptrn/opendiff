import { type SpawnOptionsWithoutStdio, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

interface ManagedProcessOptions extends SpawnOptionsWithoutStdio {
  shutdownGraceMs?: number;
  killTimeoutMs?: number;
}

const activeProcesses = new Set<{ stop(): Promise<void>; kill(): void }>();
let shuttingDown = false;
let cleanupFailed = false;

function killAll(): void {
  for (const child of activeProcesses) {
    try {
      child.kill();
    } catch (error) {
      console.error("Failed to kill child process during exit:", error);
    }
  }
}

async function shutdown(signal: "SIGTERM" | "SIGINT"): Promise<void> {
  if (shuttingDown) {
    killAll();
    return;
  }
  shuttingDown = true;
  const results = await Promise.allSettled([...activeProcesses].map((child) => child.stop()));
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Child process shutdown failed:", result.reason);
    }
  }
  process.exit(signal === "SIGTERM" ? 143 : 130);
}

function onSigterm(): void {
  void shutdown("SIGTERM");
}

function onSigint(): void {
  void shutdown("SIGINT");
}

function register(child: { stop(): Promise<void>; kill(): void }): void {
  if (activeProcesses.size === 0) {
    process.on("exit", killAll);
    process.on("SIGTERM", onSigterm);
    process.on("SIGINT", onSigint);
  }
  activeProcesses.add(child);
}

function unregister(child: { stop(): Promise<void>; kill(): void }): void {
  activeProcesses.delete(child);
  if (activeProcesses.size === 0) {
    process.off("exit", killAll);
    process.off("SIGTERM", onSigterm);
    process.off("SIGINT", onSigint);
  }
}

export function spawnManagedProcess(
  command: string,
  args: string[],
  options: ManagedProcessOptions = {}
) {
  if (shuttingDown || cleanupFailed) {
    throw new Error("Cannot start a child process after shutdown or failed process cleanup");
  }
  const { shutdownGraceMs = 5_000, killTimeoutMs = 5_000, ...spawnOptions } = options;
  const useProcessGroup = process.platform !== "win32";
  const child = spawn(command, args, { ...spawnOptions, detached: useProcessGroup });
  let spawnFailed = false;
  child.once("error", () => {
    spawnFailed = true;
  });

  function isRunning(): boolean {
    if (!child.pid || spawnFailed) {
      return false;
    }
    try {
      process.kill(useProcessGroup ? -child.pid : child.pid, 0);
      // A zombie grandchild may await PID 1, but no longer holds its address space.
      if (process.platform === "linux" && (child.exitCode !== null || child.signalCode !== null)) {
        for (const pid of readdirSync("/proc")) {
          if (!/^\d+$/.test(pid)) {
            continue;
          }
          let stat: string;
          try {
            stat = readFileSync(`/proc/${pid}/stat`, "utf8");
          } catch (error) {
            if (["ENOENT", "ESRCH"].includes((error as NodeJS.ErrnoException).code ?? "")) {
              continue;
            }
            throw error;
          }
          const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
          if (Number(fields[2]) === child.pid && fields[0] !== "Z" && fields[0] !== "X") {
            return true;
          }
        }
        return false;
      }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH") {
        return false;
      }
      if ((error as NodeJS.ErrnoException).code === "EPERM") {
        return true;
      }
      throw error;
    }
  }

  function signal(signalName: NodeJS.Signals): void {
    if (!child.pid || spawnFailed) {
      return;
    }
    try {
      // The launcher may have exited while its descendants still own the group.
      process.kill(useProcessGroup ? -child.pid : child.pid, signalName);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
        throw error;
      }
    }
  }

  async function waitForExit(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (isRunning()) {
      if (Date.now() >= deadline) {
        return false;
      }
      await delay(Math.min(50, Math.max(1, deadline - Date.now())));
    }
    return true;
  }

  let stopping: Promise<void> | undefined;
  const managed = {
    process: child,
    kill() {
      signal("SIGKILL");
    },
    stop(): Promise<void> {
      stopping ??= (async () => {
        try {
          signal("SIGTERM");
          if (!(await waitForExit(shutdownGraceMs))) {
            console.warn(`Child process group ${child.pid} did not stop; sending SIGKILL`);
            signal("SIGKILL");
            if (!(await waitForExit(killTimeoutMs))) {
              throw new Error(`Child process group ${child.pid} survived SIGKILL`);
            }
          }
          child.stdin.destroy();
          child.stdout.destroy();
          child.stderr.destroy();
          unregister(managed);
        } catch (error) {
          cleanupFailed = true;
          throw error;
        }
      })();
      return stopping;
    },
  };
  register(managed);
  return managed;
}
