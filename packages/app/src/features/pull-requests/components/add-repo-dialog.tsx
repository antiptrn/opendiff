import type { OrgRepository, Repository } from "@/features/repositories";
import { Loader2, LogIn, Search } from "lucide-react";
import { Button } from "components/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "components/components/ui/dialog";
import { Input } from "components/components/ui/input";
import { Link } from "react-router-dom";
import { RepoListItem } from "./repo-list-item";

interface AddRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasAccessToken: boolean;
  authProvider?: string;
  hasGithubLinked?: boolean;
  onLogout: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  repositories: Repository[];
  activatedRepos: OrgRepository[];
  isLoading: boolean;
  debouncedQuery: string;
  onRepoSelect: (fullName: string) => void;
}

/**
 * Dialog for searching and selecting a repository to add
 */
export function AddRepoDialog({
  open,
  onOpenChange,
  hasAccessToken,
  authProvider,
  hasGithubLinked,
  onLogout,
  searchQuery,
  onSearchChange,
  repositories,
  activatedRepos,
  isLoading,
  debouncedQuery,
  onRepoSelect,
}: AddRepoDialogProps) {
  const needsGithubLink = authProvider === "google" && !hasGithubLinked;

  const getDescription = () => {
    if (!hasAccessToken) {
      return "Please log out and log back in to grant repository access permissions.";
    }
    if (needsGithubLink) {
      return "Link your GitHub account to search and add repositories.";
    }
    return "Search for a repository to add to your organization.";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) {
          onSearchChange("");
        }
      }}
    >
      <DialogContent className={needsGithubLink ? "sm:max-w-sm" : "sm:max-w-xl"}>
        <DialogHeader>
          <DialogTitle>Add Repository</DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        {!hasAccessToken ? (
          <Button variant="outline" onClick={onLogout}>
            <LogIn className="size-4" />
            Log out to re-authenticate
          </Button>
        ) : needsGithubLink ? (
          <Button asChild>
            <Link to="/console/settings/account">Go to Settings</Link>
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="relative w-full">
              <Search
                strokeWidth={2.5}
                className="size-4.5 absolute left-5 top-1/2 -translate-y-1/2 text-foreground"
              />
              <Input
                className="pl-12.5 bg-background"
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
              />
            </div>
            <div className="max-h-80 bg-background overflow-y-auto rounded-2xl py-2.5">
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {!isLoading && repositories.length === 0 && (
                <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                  {debouncedQuery
                    ? `No repositories matching "${debouncedQuery}"`
                    : "Start typing to search..."}
                </div>
              )}
              {!isLoading &&
                repositories.map((repo) => {
                  const isAlreadyAdded = activatedRepos.some(
                    (r) => r.owner === repo.owner && r.repo === repo.name
                  );
                  return (
                    <button
                      key={repo.full_name}
                      type="button"
                      onClick={() => !isAlreadyAdded && onRepoSelect(repo.full_name)}
                      disabled={isAlreadyAdded}
                      className={`w-full text-left px-5 py-2 transition-colors ${
                        isAlreadyAdded
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:bg-muted/50 cursor-pointer"
                      }`}
                    >
                      <RepoListItem name={repo.full_name}>
                        {isAlreadyAdded && (
                          <span className="text-sm text-muted-foreground">Added</span>
                        )}
                      </RepoListItem>
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
