interface GitHubRepoOwner {
  login: string;
}

export interface GitHubRepoSummary {
  id: number;
  full_name: string;
  owner: GitHubRepoOwner;
  name: string;
  private: boolean;
  language: string | null;
  pushed_at: string | null;
  description: string | null;
}

const GITHUB_REPOS_PER_PAGE = 100;
const DEFAULT_MAX_PAGES = 10;

export async function fetchGitHubRepoByFullName(
  githubToken: string,
  fullName: string
): Promise<GitHubRepoSummary | null> {
  const trimmed = fullName.trim();
  const match = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!match) {
    return null;
  }

  const [, owner, repo] = match;
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (response.status === 404) {
    console.warn(`[repos] Exact lookup miss for ${owner}/${repo}: 404`);
    return null;
  }

  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch {
      body = "";
    }
    console.warn(
      `[repos] Exact lookup error for ${owner}/${repo}: ${response.status} body=${body.slice(0, 500)}`
    );
    throw new Error(`GitHub repo lookup failed: ${response.status}`);
  }

  console.log(`[repos] Exact lookup hit for ${owner}/${repo}`);
  return (await response.json()) as GitHubRepoSummary;
}

/**
 * Fetch GitHub repos across multiple pages because many users exceed the first page.
 * Optional search filtering is applied incrementally so search can stop early once enough matches exist.
 */
export async function fetchGitHubRepos(
  githubToken: string,
  options?: {
    query?: string;
    sort?: "updated" | "created" | "pushed" | "full_name";
    maxPages?: number;
    targetCount?: number;
  }
): Promise<GitHubRepoSummary[]> {
  const normalizedQuery = options?.query?.trim().toLowerCase() || "";
  const targetCount = options?.targetCount ?? 50;
  const maxPages = options?.maxPages ?? DEFAULT_MAX_PAGES;
  const sort = options?.sort ?? "updated";
  const repos: GitHubRepoSummary[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL("https://api.github.com/user/repos");
    url.searchParams.set("per_page", String(GITHUB_REPOS_PER_PAGE));
    url.searchParams.set("page", String(page));
    url.searchParams.set("sort", sort);
    url.searchParams.set("affiliation", "owner,collaborator,organization_member");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub repo fetch failed: ${response.status}`);
    }

    const pageRepos = (await response.json()) as GitHubRepoSummary[];
    const filteredPageRepos = normalizedQuery
      ? pageRepos.filter((repo) => repo.full_name.toLowerCase().includes(normalizedQuery))
      : pageRepos;

    repos.push(...filteredPageRepos);

    if (repos.length >= targetCount) {
      return repos.slice(0, targetCount);
    }

    if (pageRepos.length < GITHUB_REPOS_PER_PAGE) {
      break;
    }
  }

  return repos.slice(0, targetCount);
}
