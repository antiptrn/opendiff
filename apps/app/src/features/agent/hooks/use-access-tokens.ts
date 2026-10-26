import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, fetchWithAuth } from "shared/services";

/** A personal access token for connecting an agent; the token itself is only ever shown once */
export interface AccessTokenSummary {
  id: string;
  name: string;
  /** The token's first characters, to tell tokens apart */
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const accessTokensKey = (orgId?: string | null) => ["accessTokens", orgId] as const;

/** The signed-in user's access tokens for the current organization */
export function useAccessTokens(token?: string, orgId?: string | null) {
  return useQuery<{ tokens: AccessTokenSummary[] }>({
    queryKey: accessTokensKey(orgId),
    queryFn: () => fetchWithAuth(`${API_URL}/api/access-tokens`, token, orgId),
    enabled: !!token && !!orgId,
  });
}

/** Creates a token and returns it (the only time it's available) */
export function useCreateAccessToken(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      fetchWithAuth(`${API_URL}/api/access-tokens`, token, orgId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }) as Promise<{ token: string; accessToken: AccessTokenSummary }>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accessTokensKey(orgId) }),
  });
}

/** Revokes a token, so agents using it lose access straight away */
export function useRevokeAccessToken(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchWithAuth(`${API_URL}/api/access-tokens/${id}`, token, orgId, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: accessTokensKey(orgId) }),
  });
}

/** Where agents connect: the API's MCP endpoint */
export const MCP_URL = `${API_URL}/mcp`;
