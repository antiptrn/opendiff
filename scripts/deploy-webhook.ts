import { $ } from "bun";

const PORT = 9000;
const SECRET = process.env.DEPLOY_WEBHOOK_SECRET || "";
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

async function verifySignature(body: string, signature: string | null): Promise<boolean> {
  if (!SECRET || !signature) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = `sha256=${Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  return signature === expected;
}

async function deploy() {
  console.log(`[${new Date().toISOString()}] Deploy started`);
  try {
    await $`cd ${ROOT} && git pull`.quiet();
    console.log("  git pull done");

    await $`cd ${ROOT} && bun install`.quiet();
    console.log("  bun install done");

    // Build before stopping services to minimize downtime
    await $`cd ${ROOT} && bun run --cwd opendiff-website build`.quiet();
    console.log("  website built");

    await $`cd ${ROOT} && bun run --cwd opendiff-app build`.quiet();
    console.log("  app built");

    await $`cd ${ROOT} && bun run --cwd opendiff-review-agent build`.quiet();
    console.log("  agent built");

    await $`cd ${ROOT} && bash scripts/stop.sh`.quiet();
    console.log("  services stopped");

    await $`cd ${ROOT} && bash scripts/start.sh prod --skip-build`.quiet();
    console.log("  services started");

    console.log(`[${new Date().toISOString()}] Deploy complete`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Deploy failed:`, error);
  }
}

let deploying = false;

export default {
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    if (req.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    const event = req.headers.get("x-github-event");
    const signature = req.headers.get("x-hub-signature-256");
    const body = await req.text();

    if (!await verifySignature(body, signature)) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (event !== "push") {
      return new Response("Ignored", { status: 200 });
    }

    const payload = JSON.parse(body);
    if (payload.ref !== "refs/heads/main") {
      return new Response("Not main branch", { status: 200 });
    }

    if (deploying) {
      return new Response("Deploy already in progress", { status: 409 });
    }

    deploying = true;
    deploy().finally(() => { deploying = false; });

    return new Response("Deploy started", { status: 200 });
  },
};

console.log(`Deploy webhook listening on port ${PORT}`);
