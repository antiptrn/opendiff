import {
  Comment02Icon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Checkbox } from "../ui/checkbox";
import { formatRelative } from "../../utils/relative-time";

/** What a pull request row shows; the console's list endpoint returns this and more */
export interface PullRequestRowItem {
  pullNumber: number;
  pullTitle: string | null;
  owner: string | null;
  repo: string | null;
  pullAuthor: string | null;
  authorAvatarUrl: string | null;
  state: "open" | "closed" | "merged" | null;
  draft: boolean;
  labels: Array<{ name: string; color: string }>;
  githubCommentCount: number | null;
  openedAt: string | null;
  /** Issues Contrast found */
  commentCount: number;
}

/** The state icon GitHub shows before a pull request: open, draft, merged or closed */
function StateIcon({ pullRequest }: { pullRequest: PullRequestRowItem }) {
  if (pullRequest.state === "merged") {
    return (
      <HugeiconsIcon icon={GitMergeIcon} aria-label="Merged" className="size-4 text-violet-500" />
    );
  }
  if (pullRequest.state === "closed") {
    return (
      <HugeiconsIcon
        icon={GitPullRequestClosedIcon}
        aria-label="Closed"
        className="size-4 text-destructive"
      />
    );
  }
  if (pullRequest.draft) {
    return (
      <HugeiconsIcon
        icon={GitPullRequestDraftIcon}
        aria-label="Draft"
        className="size-4 text-muted-foreground"
      />
    );
  }
  return (
    <HugeiconsIcon icon={GitPullRequestIcon} aria-label="Open" className="size-4 text-success" />
  );
}

/**
 * A label as GitHub draws it, a pill tinted with the label's colour. GitHub's raw colours are often
 * too dark or too loud to read as text, so the text mixes the colour with the theme's foreground
 * (pastel on dark backgrounds, deep on light ones), over a faint wash and border of the same colour.
 */
function LabelPill({ name, color }: { name: string; color: string }) {
  const hex = `#${color}`;
  return (
    <span
      className="inline-flex h-5 items-center rounded-full border px-2 text-xs leading-none"
      style={{
        color: `color-mix(in oklab, ${hex} 55%, var(--foreground))`,
        borderColor: `color-mix(in oklab, ${hex} 35%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${hex} 12%, transparent)`,
      }}
    >
      {name}
    </span>
  );
}

interface PullRequestRowProps {
  pullRequest: PullRequestRowItem;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  onOpen: () => void;
}

/**
 * One pull request in the list, laid out like GitHub's: a checkbox, the state icon, the title with
 * its labels, then the number, repository, when it was opened and by whom, and the issues
 * Contrast found. GitHub's comment count and the author's avatar sit on the right.
 */
export function PullRequestRow({
  pullRequest,
  selected,
  onSelectedChange,
  onOpen,
}: PullRequestRowProps) {
  const title = pullRequest.pullTitle || `#${pullRequest.pullNumber}`;
  const repository =
    pullRequest.owner && pullRequest.repo ? `${pullRequest.owner}/${pullRequest.repo}` : null;
  const issues = pullRequest.commentCount;

  return (
    <li
      data-selected={selected || undefined}
      className="group/row flex items-start gap-3 border-b border-border-solid px-4 py-3 last:border-b-0 hover:bg-muted/40 data-selected:bg-muted/60"
    >
      {/* The checkbox and icon centre on the title's line: all three are 20px tall */}
      <div className="flex h-5 items-center">
        <Checkbox
          aria-label={`Select ${title}`}
          checked={selected}
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
        />
      </div>
      <div className="flex h-5 items-center">
        <StateIcon pullRequest={pullRequest} />
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            className="min-w-0 cursor-pointer text-left text-sm leading-none font-normal text-foreground hover:text-primary"
            onClick={onOpen}
          >
            {title}
          </button>
          {pullRequest.labels.map((label) => (
            <LabelPill key={label.name} name={label.name} color={label.color} />
          ))}
        </div>
        <p className="text-xs leading-none text-muted-foreground">
          #{pullRequest.pullNumber}
          {repository && <> · {repository}</>}
          {pullRequest.openedAt && <> · opened {formatRelative(pullRequest.openedAt)}</>}
          {pullRequest.pullAuthor && <> by {pullRequest.pullAuthor}</>}
          {issues > 0 && (
            <>
              {" "}
              · {issues} issue{issues === 1 ? "" : "s"} found
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-4 self-center text-xs text-muted-foreground">
        {!!pullRequest.githubCommentCount && (
          <span
            className="flex items-center gap-1"
            title={`${pullRequest.githubCommentCount} comments on GitHub`}
          >
            <HugeiconsIcon icon={Comment02Icon} aria-hidden="true" className="size-4" />
            {pullRequest.githubCommentCount}
          </span>
        )}
        {pullRequest.pullAuthor && (
          <Avatar className="size-5">
            <AvatarImage
              src={pullRequest.authorAvatarUrl || undefined}
              alt={pullRequest.pullAuthor}
            />
            <AvatarFallback className="text-[10px]">
              {pullRequest.pullAuthor.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </li>
  );
}
