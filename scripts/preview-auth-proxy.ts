/**
 * Preview OAuth Auth Proxy
 *
 * Listens on port 9999 and forwards OAuth callbacks to the correct
 * preview BFF based on the `prNumber` encoded in the OAuth `state` param.
 *
 * GitHub OAuth only allows one callback URL, so all previews share
 * https://api-preview.opendiff.dev/auth/github/callback which routes here.
 */

const PORT = 9999;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Only handle OAuth callback paths
    if (!url.pathname.match(/^\/auth\/(github|google|microsoft)\/callback$/)) {
      return new Response("Not Found", { status: 404 });
    }

    const state = url.searchParams.get("state");
    if (!state) {
      return new Response("Missing state parameter", { status: 400 });
    }

    let prNumber: number;
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64").toString());
      prNumber = decoded.prNumber;
      if (!prNumber || typeof prNumber !== "number") {
        return new Response("Missing prNumber in state", { status: 400 });
      }
    } catch {
      return new Response("Invalid state parameter", { status: 400 });
    }

    const targetPort = 10000 + prNumber;
    const targetUrl = `http://localhost:${targetPort}${url.pathname}${url.search}`;

    try {
      const upstream = await fetch(targetUrl, { redirect: "manual" });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: upstream.headers,
      });
    } catch (e) {
      console.error(`Failed to proxy to localhost:${targetPort}:`, e);
      return new Response("Preview BFF unavailable", { status: 502 });
    }
  },
});

console.log(`Preview auth proxy listening on port ${PORT}`);
