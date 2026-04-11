import { FolderGit } from "lucide-react";
import type { ReactNode } from "react";

interface RepoListItemProps {
  name: string;
  children?: ReactNode;
}

/** Displays a repository name with a folder icon and optional child elements. */
export function RepoListItem({ name, children }: RepoListItemProps) {
  return (
    <div className="flex items-center gap-3">
      <FolderGit className="size-5 text-foreground shrink-0" />
      <div className="min-w-0 flex flex-col flex-1">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-lg truncate">{name}</span>
          {children}
        </div>
      </div>
    </div>
  );
}
