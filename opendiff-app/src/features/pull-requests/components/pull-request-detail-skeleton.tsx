import { Card, CardContent } from "opendiff-components/components/ui/card";
import { Skeleton } from "opendiff-components/components/ui/skeleton";

export function PullRequestDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-24 rounded-md" />
      <Skeleton className="h-5 w-48 rounded-md" />
      <Skeleton className="h-9 w-96 rounded-md" />
      <Skeleton className="h-5 w-64 rounded-md" />
      <Skeleton className="h-px w-full" />
      <div className="flex gap-8">
        <div className="flex-1 space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-5 w-48 rounded-md" />
          {[1, 2].map((i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <Skeleton muted className="h-5 w-full rounded-md" />
                <Skeleton muted className="h-5 w-3/4 mt-2 rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="w-72 shrink-0">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <Skeleton muted className="h-5 w-24 rounded-md" />
              <Skeleton muted className="h-6 w-full rounded-md" />
              <Skeleton muted className="h-5 w-24 mt-4 rounded-md" />
              <Skeleton muted className="h-5 w-32 rounded-md" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
