import { Separator } from "components/components/ui/separator";
import { Skeleton } from "components/components/ui/skeleton";
import type { ReactNode } from "react";

interface SubscriptionInfoListProps {
  isLoading?: boolean;
  children: ReactNode;
}

/**
 * Container for subscription info items
 */
export function SubscriptionInfoList({ isLoading, children }: SubscriptionInfoListProps) {
  if (isLoading) {
    return (
      <dl className="text-sm">
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-16 rounded-md" />
          <Skeleton className="h-6 w-20 rounded-md" />
        </div>
        <Separator className="my-4" />
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-12 rounded-md" />
          <Skeleton className="h-6 w-24 rounded-md" />
        </div>
        <Separator className="my-4" />
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-16 rounded-md" />
          <Skeleton className="h-6 w-32 rounded-md" />
        </div>
        <Separator className="my-4" />
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-28 rounded-md" />
          <Skeleton className="h-6 w-20 rounded-md" />
        </div>
      </dl>
    );
  }

  return <dl className="text-sm">{children}</dl>;
}

interface SubscriptionInfoItemProps {
  label: string;
  children: ReactNode;
  separator?: boolean;
}

/**
 * Single item in subscription info list
 */
export function SubscriptionInfoItem({
  label,
  children,
  separator = true,
}: SubscriptionInfoItemProps) {
  return (
    <>
      <div className="flex justify-between items-center">
        <dt className="text-muted-foreground text-base">{label}</dt>
        <dd className="text-base">{children}</dd>
      </div>
      {separator && <Separator className="my-4" />}
    </>
  );
}
