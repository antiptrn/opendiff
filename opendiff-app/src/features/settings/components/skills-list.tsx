import type { Skill } from "@/features/settings";
import { Loader2 } from "lucide-react";
import { Skeleton } from "opendiff-components/components/ui/skeleton";
import { useEffect, useRef } from "react";
import { SkillCard } from "./skill-card";

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

function SkillsListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between py-1">
          <div className="space-y-1.5">
            <Skeleton muted className="h-6 w-32 rounded-md" />
            <Skeleton muted className="h-5 w-56 rounded-md" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton muted className="size-9 rounded-full" />
            <Skeleton muted className="size-9 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ searchQuery }: { searchQuery: string }) {
  return (
    <p className="text-base text-muted-foreground">
      {searchQuery
        ? `No skills matching "${searchQuery}"`
        : "No skills yet. Create one to customize how the agent reviews your code."}
    </p>
  );
}

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
  if (isLoading) {
    return <SkillsListSkeleton />;
  }

  if (skills.length === 0) {
    return <EmptyState searchQuery={searchQuery} />;
  }

  return (
    <>
      {skills.map((skill, index) => (
        <SkillCard
          key={skill.id}
          skill={skill}
          showSeparator={index > 0}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}

      {hasNextPage && <ScrollSentinel onVisible={onFetchNextPage} disabled={isFetchingNextPage} />}

      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </>
  );
}
