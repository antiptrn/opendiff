export interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  head: {
    sha: string;
    ref: string;
  };
  base: {
    sha: string;
    ref: string;
  };
  user: {
    login: string;
  };
}

export interface PullRequestFile {
  filename: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  patch?: string;
}

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
  side?: "LEFT" | "RIGHT";
}

export interface Review {
  body: string;
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
  comments?: ReviewComment[];
}

export interface RepoContext {
  owner: string;
  repo: string;
}
