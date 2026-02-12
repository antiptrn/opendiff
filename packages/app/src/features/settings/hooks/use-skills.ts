import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_URL, queryKeys } from "shared/services";

export interface Skill {
  id: string;
  userId: string;
  name: string;
  description: string;
  content: string;
  resources: { id: string; path: string; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

interface SkillsResponse {
  skills: Skill[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const SKILLS_LIMIT = 15;

/** Fetches a paginated, searchable list of user-defined skills. */
export function useSkills(token?: string, search?: string) {
  return useInfiniteQuery<SkillsResponse>({
    queryKey: [...queryKeys.skills(), search] as const,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        limit: String(SKILLS_LIMIT),
      });
      if (search?.trim()) {
        params.set("search", search.trim());
      }

      const response = await fetch(`${API_URL}/api/skills?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Request failed" }));
        throw new Error(error.error || "Request failed");
      }

      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.page < lastPage.pagination.totalPages) {
        return lastPage.pagination.page + 1;
      }
      return undefined;
    },
    enabled: !!token,
    staleTime: 30 * 1000,
  });
}

/** Creates a new skill with a name, description, and content. */
export function useCreateSkill(token?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; description: string; content: string }) => {
      const response = await fetch(`${API_URL}/api/skills`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to create skill");
      }
      return data.skill as Skill;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills() });
    },
  });
}

/** Updates an existing skill's name, description, or content by ID. */
export function useUpdateSkill(token?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      name?: string;
      description?: string;
      content?: string;
    }) => {
      const response = await fetch(`${API_URL}/api/skills/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(updates),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update skill");
      }
      return data.skill as Skill;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills() });
    },
  });
}

/** Deletes a skill by ID and invalidates the skills cache. */
export function useDeleteSkill(token?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`${API_URL}/api/skills/${id}`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete skill");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.skills() });
    },
  });
}
