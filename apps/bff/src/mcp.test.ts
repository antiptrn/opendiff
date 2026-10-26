import { beforeEach, describe, expect, it, mock } from "bun:test";

const findAccessToken = mock((_token: string) =>
  Promise.resolve<{ organizationId: string } | null>({ organizationId: "org-1" })
);

const { createMcpRoutes } = await import("./mcp");
const { isAccessTokenRouteAllowed } = await import("./access-tokens");

const apiCalls: Request[] = [];
const fetchApi = mock(async (request: Request) => {
  apiCalls.push(request);
  const url = new URL(request.url);
  if (url.pathname === "/api/settings/acme/web" && request.method === "GET") {
    return Response.json({ enabled: true, approveEnabled: false, autofixEnabled: true, sensitivity: 50 });
  }
  return Response.json({ path: url.pathname, query: url.search });
});

function rpc(method: string, params?: unknown, token = "cpat_test") {
  const app = createMcpRoutes(fetchApi, findAccessToken);
  return app.request("http://localhost/mcp", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

const callTool = async (name: string, args: Record<string, unknown>) =>
  (await (await rpc("tools/call", { name, arguments: args })).json()).result;

describe("MCP server", () => {
  beforeEach(() => {
    apiCalls.length = 0;
    findAccessToken.mockClear();
  });

  it("refuses requests without a valid access token", async () => {
    findAccessToken.mockResolvedValueOnce(null);
    expect((await rpc("tools/list", undefined, "cpat_revoked")).status).toBe(401);
    expect((await rpc("tools/list", undefined, "cst_session")).status).toBe(401);
  });

  it("lists the console's actions as tools", async () => {
    const body = await (await rpc("tools/list")).json();
    const names = body.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "list_pull_requests",
        "get_pull_request",
        "accept_fix",
        "connect_repository",
        "update_repository_settings",
        "disconnect_repository",
      ])
    );
  });

  it("calls the API as the token's user and organization", async () => {
    await callTool("list_pull_requests", { state: "closed", authors: ["ada"] });

    const [request] = apiCalls;
    expect(new URL(request.url).pathname).toBe("/api/reviews");
    expect(new URL(request.url).searchParams.get("state")).toBe("closed");
    expect(new URL(request.url).searchParams.get("author")).toBe("ada");
    expect(request.headers.get("Authorization")).toBe("Bearer cpat_test");
    expect(request.headers.get("X-Organization-Id")).toBe("org-1");
  });

  it("keeps the other settings when updating one", async () => {
    await callTool("update_repository_settings", { owner: "acme", repo: "web", sensitivity: 80 });

    const put = apiCalls.find((request) => request.method === "PUT");
    expect(await put?.json()).toMatchObject({
      enabled: true,
      approveEnabled: false,
      autofixEnabled: true,
      sensitivity: 80,
    });
  });

  it("won't delete a skill without confirm: true", async () => {
    const result = await callTool("delete_skill", { id: "s1" });

    expect(result.isError).toBe(true);
    expect(apiCalls.some((request) => request.method === "DELETE")).toBe(false);
  });

  it("sends only the labels and assignees given when updating a pull request", async () => {
    await callTool("update_pull_request", { id: "r1", labels: ["bug"] });

    const patch = apiCalls.find((request) => request.method === "PATCH");
    expect(new URL(patch?.url ?? "").pathname).toBe("/api/reviews/r1");
    expect(await patch?.json()).toEqual({ labels: ["bug"] });
  });

  it("won't disconnect a repository without confirm: true", async () => {
    const result = await callTool("disconnect_repository", { owner: "acme", repo: "web" });

    expect(result.isError).toBe(true);
    expect(apiCalls.some((request) => request.method === "DELETE")).toBe(false);
  });
});

describe("access token routes", () => {
  it("allows only what the MCP tools need", () => {
    expect(isAccessTokenRouteAllowed("GET", "/api/reviews")).toBe(true);
    expect(isAccessTokenRouteAllowed("POST", "/api/reviews/r1/fixes/f1/accept")).toBe(true);
    expect(isAccessTokenRouteAllowed("PUT", "/api/settings/acme/web")).toBe(true);

    expect(isAccessTokenRouteAllowed("GET", "/api/stats/usage")).toBe(true);
    expect(isAccessTokenRouteAllowed("PUT", "/api/settings/review-rules")).toBe(true);
    expect(isAccessTokenRouteAllowed("DELETE", "/api/skills/s1")).toBe(true);
    expect(isAccessTokenRouteAllowed("POST", "/api/notifications/read-all")).toBe(true);

    expect(isAccessTokenRouteAllowed("GET", "/api/access-tokens")).toBe(false);
    expect(isAccessTokenRouteAllowed("POST", "/api/skills/s1/resources")).toBe(false);
    expect(isAccessTokenRouteAllowed("GET", "/api/stats/reviews-over-time")).toBe(false);
    expect(isAccessTokenRouteAllowed("PUT", "/api/settings/ai-config")).toBe(false);
    expect(isAccessTokenRouteAllowed("GET", "/api/organizations/org-1")).toBe(false);
    expect(isAccessTokenRouteAllowed("DELETE", "/api/account")).toBe(false);
  });
});
