import type { OrgRepository } from "@/features/repositories";
import { GithubMark } from "components/components/github-mark";
import { Badge } from "components/components/ui/badge";
import { Checkbox } from "components/components/ui/checkbox";
import { RepoRowActions } from "./repo-row-actions";
import { formatRelative } from "components/utils";

// GitHub's colours for the languages we see most; anything else gets a neutral dot
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572a5",
  Go: "#00add8",
  Rust: "#dea584",
  Java: "#b07219",
  Kotlin: "#a97bff",
  Swift: "#f05138",
  Ruby: "#701516",
  PHP: "#4f5d95",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  HTML: "#e34c26",
  CSS: "#663399",
  Shell: "#89e051",
  Dart: "#00b4ab",
  Elixir: "#6e4a7e",
  Vue: "#41b883",
  Svelte: "#ff3e00",
};

interface RepoTableProps {
  repos: readonly OrgRepository[];
  onEdit: (repo: OrgRepository) => void;
  onDelete: (repo: OrgRepository) => void;
  /** Full names ("owner/repo") of the ticked rows */
  selected: ReadonlySet<string>;
  onSelectedChange: (fullName: string, selected: boolean) => void;
}

/**
 * Connected repositories as rows in a list box, laid out like the pull request list: the GitHub
 * mark, the name with its visibility, then the description, language and last push; a row menu
 * on the right. Review and auto-fix settings live in the repository's sheet.
 */
export function RepoTable({ repos, onEdit, onDelete, selected, onSelectedChange }: RepoTableProps) {
  return (
    <ul aria-label="Repositories">
      {repos.map((repo) => {
        const fullName = repo.fullName || `${repo.owner}/${repo.repo}`;
        const details = [repo.description, repo.language, repo.pushedAt].some(Boolean);
        return (
          <li
            key={fullName}
            data-selected={selected.has(fullName) || undefined}
            className="flex items-start gap-3 border-b border-border-solid px-4 py-3 last:border-b-0 hover:bg-muted/40 data-selected:bg-muted/60"
          >
            {/* The left side is centred in the row as a block; inside it the checkbox and mark centre
                on the name's line, which the 24px badge sets the height of */}
            <div className="flex min-w-0 flex-1 items-start gap-2 self-center">
              {/* Further from the mark than the mark is from the name, so mark and name read as one */}
              <div className="mr-2 flex h-6 items-center">
                <Checkbox
                  aria-label={`Select ${fullName}`}
                  checked={selected.has(fullName)}
                  onCheckedChange={(checked) => onSelectedChange(fullName, checked === true)}
                />
              </div>
              <div className="flex h-6 items-center">
                <GithubMark className="text-primary" />
              </div>

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
                  <button
                    type="button"
                    className="min-w-0 cursor-pointer truncate py-0.5 text-left text-sm leading-none font-normal text-foreground hover:text-primary"
                    onClick={() => onEdit(repo)}
                  >
                    {fullName}
                  </button>
                  <Badge variant="outline" className="rounded-full leading-none">
                    {repo.isPrivate ? "Private" : "Public"}
                  </Badge>
                </div>
                {/* Only when there's something to show, so an empty line can't push the name up */}
                {details && (
                  <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs leading-none text-muted-foreground">
                    {repo.description && (
                      <span className="min-w-0 truncate">{repo.description}</span>
                    )}
                    {repo.language && (
                      <span className="flex items-center gap-1.5">
                        {repo.description && <span aria-hidden="true">·</span>}
                        <span
                          aria-hidden="true"
                          className="size-2.5 rounded-full bg-muted-foreground"
                          style={{ backgroundColor: LANGUAGE_COLORS[repo.language] }}
                        />
                        {repo.language}
                      </span>
                    )}
                    {repo.pushedAt && (
                      <span>
                        {(repo.description || repo.language) && <span aria-hidden="true">· </span>}
                        Updated {formatRelative(repo.pushedAt)}
                      </span>
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center self-center">
              <RepoRowActions
                repository={repo}
                onEdit={() => onEdit(repo)}
                onDelete={() => onDelete(repo)}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
