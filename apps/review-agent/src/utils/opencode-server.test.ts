import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runOpencodePrompt } from "./opencode";
import { createManagedOpencode } from "./opencode-server";

async function withFakeServer(source: string, run: (pidFile: string) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), "opencode-server-test-"));
  const pidFile = join(directory, "pid");
  writeFileSync(
    join(directory, "opencode"),
    `#!${process.execPath}\nrequire("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));\n${source}`,
    { mode: 0o700 }
  );
  const previousPath = process.env.PATH;
  process.env.PATH = `${directory}:${previousPath ?? ""}`;
  try {
    await run(pidFile);
  } finally {
    if (previousPath === undefined) {
      Reflect.deleteProperty(process.env, "PATH");
    } else {
      process.env.PATH = previousPath;
    }
    rmSync(directory, { recursive: true, force: true });
  }
}

function expectExited(pidFile: string): void {
  const pid = Number(readFileSync(pidFile, "utf8"));
  expect(() => process.kill(pid, 0)).toThrow();
}

describe.skipIf(process.platform === "win32")("managed OpenCode server", () => {
  it("parses a split listening line and waits for exit when closed", async () => {
    await withFakeServer(
      `
      process.stdout.write("opencode server lis");
      setTimeout(() => console.log("tening on http://127.0.0.1:43210"), 20);
      setInterval(() => {}, 1000);
    `,
      async (pidFile) => {
        const server = await createManagedOpencode({ port: 0, timeout: 1000, config: {} });
        try {
          expect(server.server.url).toBe("http://127.0.0.1:43210");
        } finally {
          await server.server.close();
        }
        expectExited(pidFile);
      }
    );
  });

  it("cleans up a server that never becomes ready", async () => {
    await withFakeServer("setInterval(() => {}, 1000);", async (pidFile) => {
      await expect(createManagedOpencode({ port: 0, timeout: 500, config: {} })).rejects.toThrow(
        "Timeout waiting"
      );
      expectExited(pidFile);
    });
  });

  it("cleans up a server with an invalid listening address", async () => {
    await withFakeServer(
      'console.log("opencode server listening on nowhere"); setInterval(() => {}, 1000);',
      async (pidFile) => {
        await expect(createManagedOpencode({ port: 0, timeout: 1000, config: {} })).rejects.toThrow(
          "Invalid OpenCode"
        );
        expectExited(pidFile);
      }
    );
  });

  it("reports unexpected startup exit and bounded diagnostics", async () => {
    await withFakeServer(
      'process.stderr.write("x".repeat(100000) + "STARTUP_FAILURE"); process.exit(7);',
      async (pidFile) => {
        const error = await createManagedOpencode({ port: 0, timeout: 1000, config: {} }).catch(
          (error: Error) => error
        );
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("code=7");
        expect((error as Error).message.length).toBeLessThan(17000);
        expectExited(pidFile);
      }
    );
  });

  it("cleans up after a spawn error", async () => {
    const previousPath = process.env.PATH;
    process.env.PATH = "/path/that/does/not/exist";
    try {
      await expect(createManagedOpencode({ port: 0, timeout: 1000, config: {} })).rejects.toThrow();
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("authenticates managed server requests and still waits for shutdown", async () => {
    await withFakeServer(
      `
      const expectedAuth = "Basic " + Buffer.from(process.env.OPENCODE_SERVER_USERNAME + ":" + process.env.OPENCODE_SERVER_PASSWORD).toString("base64");
      const server = Bun.serve({port: 0, fetch(request) {
        if (request.headers.get("authorization") !== expectedAuth) {
          return new Response("Unauthorized", {status: 401});
        }
        if (new URL(request.url).pathname === "/session") {
          return Response.json({id: "authenticated-session"});
        }
        return Response.json({info: {}, parts: [{type: "text", text: "authenticated"}]});
      }});
      console.log("opencode server listening on http://127.0.0.1:" + server.port);
      `,
      async (pidFile) => {
        const previousPassword = process.env.OPENCODE_SERVER_PASSWORD;
        const previousUsername = process.env.OPENCODE_SERVER_USERNAME;
        process.env.OPENCODE_SERVER_PASSWORD = "test-password";
        process.env.OPENCODE_SERVER_USERNAME = "test-user";
        try {
          const result = await runOpencodePrompt({
            cwd: tmpdir(),
            mode: "no_tools",
            prompt: "respond",
          });
          expect(result.text).toBe("authenticated");
          expectExited(pidFile);
        } finally {
          for (const [key, value] of [
            ["OPENCODE_SERVER_PASSWORD", previousPassword],
            ["OPENCODE_SERVER_USERNAME", previousUsername],
          ] as const) {
            if (value === undefined) Reflect.deleteProperty(process.env, key);
            else process.env[key] = value;
          }
        }
      }
    );
  });

  it("keeps the next prompt queued until a timed-out server has actually exited", async () => {
    await withFakeServer(
      `
      const fs = require("node:fs");
      const stateFile = process.argv[1] + ".runs";
      const previous = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : [];
      let previousAlive = false;
      if (previous.length) { try { process.kill(previous.at(-1).pid, 0); previousAlive = true; } catch {} }
      previous.push({pid: process.pid, previousAlive});
      fs.writeFileSync(stateFile, JSON.stringify(previous));
      process.on("SIGTERM", () => { setTimeout(() => process.exit(0), 150); });
      const server = Bun.serve({port: 0, async fetch(request) {
        if (new URL(request.url).pathname === "/session") {
          return Response.json({id: "test-session"});
        }
        const body = await request.json();
        if (body.parts?.[0]?.text === "hang") { return new Promise(() => {}); }
        return Response.json({info: {}, parts: [{type: "text", text: "ok"}]});
      }});
      console.log("opencode server listening on http://127.0.0.1:" + server.port);
    `,
      async (pidFile) => {
        const previousTimeout = process.env.OPENCODE_PROMPT_TIMEOUT_MS;
        process.env.OPENCODE_PROMPT_TIMEOUT_MS = "500";
        try {
          const input = { cwd: tmpdir(), mode: "no_tools" as const };
          const results = await Promise.allSettled([
            runOpencodePrompt({ ...input, prompt: "hang" }),
            runOpencodePrompt({ ...input, prompt: "respond" }),
          ]);
          expect(results[0].status).toBe("rejected");
          if (results[0].status === "rejected") {
            expect(results[0].reason.message).toContain("timed out");
          }
          expect(results[1]).toMatchObject({ status: "fulfilled", value: { text: "ok" } });
          const runs = JSON.parse(readFileSync(join(pidFile, "..", "opencode.runs"), "utf8"));
          expect(runs).toHaveLength(2);
          expect(runs[1].previousAlive).toBe(false);
          expectExited(pidFile);
        } finally {
          if (previousTimeout === undefined) {
            Reflect.deleteProperty(process.env, "OPENCODE_PROMPT_TIMEOUT_MS");
          } else {
            process.env.OPENCODE_PROMPT_TIMEOUT_MS = previousTimeout;
          }
        }
      }
    );
  });
});
