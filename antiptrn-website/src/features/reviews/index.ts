// Repositories feature - manages repository review configuration
// Re-exports repository hooks and types used by the reviews page

export {
  useRepositories,
  useOrgRepos,
  useRepositorySettings,
  useUpdateSettings,
  useDeleteRepoSettings,
  type Repository,
  type RepositorySettings,
  type OrgRepository,
  type RepoMetadata,
} from "@features/repositories";

// Pages
export { RepositoriesPage } from "./pages/repositories";
