// Repositories feature - manages repository review configuration
// Re-exports repository hooks and types used by the repositories page

export {
  useRepositories,
  useOrgRepos,
  useRepositorySettings,
  useUpdateSettings,
  useDeleteRepoSettings,
  type Repository,
  type RepositorySettings,
  type OrgRepository,
} from "@/features/repositories";

// Pull request hooks
export {
  usePullRequests,
  usePullRequestDetail,
  useUpdatePullRequest,
  useAcceptFix,
  useRejectFix,
  type PullRequestSummary,
  type PullRequestListResponse,
  type PullRequestDetailResponse,
  type PullRequestCommentDetail,
  type PullRequestFixDetail,
} from "./hooks/use-pull-requests";

// Pages
export { RepositoriesPage } from "./pages/repositories";
export { PullRequestsListPage } from "./pages/pull-requests-list";
export { PullRequestDetailPage } from "./pages/pull-request-detail";
