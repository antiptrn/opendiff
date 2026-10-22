import {
  Delete02Icon,
  Loading03Icon,
  PencilIcon,
  } from "@hugeicons/core-free-icons";
import { formatDate, TableEmpty } from "@/components/paginated-table";
import type { Skill } from "@/features/settings";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "components/components/ui/button";
import { DataTable } from "components/components/ui/data-table";
import { useEffect, useRef } from "react";

interface SkillsListProps {
  skills: Skill[];
  isLoading: boolean;
  searchQuery: string;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onFetchNextPage: () => void;
  onEdit: (skill: Skill) => void;
  onDelete: (skill: Skill) => void;
}

function ScrollSentinel({
  onVisible,
  disabled,
}: {
  onVisible: () => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled || !ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onVisible();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [onVisible, disabled]);

  return <div ref={ref} className="h-1" />;
}

function EmptyState({ searchQuery }: { searchQuery: string }) {
  return (
    searchQuery ? (
      <TableEmpty
        title="No matching skills"
        description={`Nothing matches "${searchQuery}".`}
      />
    ) : (
      <TableEmpty
        title="No skills yet"
        description="Create one to customize how the agent reviews your code."
      />
    )
  );
}

/** Skills table that loads more as you scroll, with search empty states and a loading skeleton */
export function SkillsList({
  skills,
  isLoading,
  searchQuery,
  hasNextPage,
  isFetchingNextPage,
  onFetchNextPage,
  onEdit,
  onDelete,
}: SkillsListProps) {
  if (!isLoading && skills.length === 0) {
    return <EmptyState searchQuery={searchQuery} />;
  }

  return (
    <>
      <DataTable
        loading={isLoading}
        skeletonRows={3}
        label="Skills"
        rows={skills}
        getKey={(skill) => skill.id}
        onRowClick={onEdit}
        columns={[
          { key: "name", header: "Skill", cell: (skill) => skill.name },
          {
            key: "description",
            header: "Description",
            cell: (skill) => (
              <span className="block max-w-80 truncate text-muted-foreground">
                {skill.description || "—"}
              </span>
            ),
          },
          { key: "updated", header: "Updated", cell: (skill) => formatDate(skill.updatedAt) },
          {
            key: "actions",
            header: <span className="sr-only">Actions</span>,
            className: "w-20",
            cell: (skill) => (
              // biome-ignore lint/a11y/noStaticElementInteractions: only stops the click reaching the row
              // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users reach the buttons directly
              <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                <Button size="icon-sm" variant="ghost" aria-label={`Edit ${skill.name}`} onClick={() => onEdit(skill)}>
                  <HugeiconsIcon icon={PencilIcon} className="size-4" />
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={`Delete ${skill.name}`} onClick={() => onDelete(skill)}>
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                </Button>
              </div>
            ),
          },
        ]}
      />

      {hasNextPage && <ScrollSentinel onVisible={onFetchNextPage} disabled={isFetchingNextPage} />}

      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </>
  );
}
