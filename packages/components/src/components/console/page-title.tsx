import type { ReactNode } from "react";

/**
 * Title at the top of a console page, the same on every page. Optionally a one-line description
 * under it and an action (such as an "Add" button) at its right.
 */
export function PageTitle({
  children,
  description,
  action,
}: {
  children: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-6">
      <div className="min-w-0">
        <h1 className="text-2xl leading-none">{children}</h1>
        {description && <p className="mt-2 text-base text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
