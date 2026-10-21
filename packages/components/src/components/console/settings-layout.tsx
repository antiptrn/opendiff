import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

/**
 * A group of settings: a title (and optional description and action) above a bordered panel.
 * Each child of the panel (usually a SettingsRow, or a block such as a table) gets the same
 * padding, with a line between them. The danger variant tints the panel for destructive actions.
 */
export function SettingsSection({
  title,
  description,
  action,
  variant = "default",
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Shown at the right of the title, such as an "Invite" button */
  action?: ReactNode;
  variant?: "default" | "danger";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-end justify-between gap-6">
        <div className="min-w-0 space-y-1">
          <h2 className={cn("text-base", variant === "danger" && "text-destructive")}>{title}</h2>
          {description && <div className="text-sm text-muted-foreground">{description}</div>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      <div
        className={cn(
          "flex flex-col divide-y rounded-xl border [&>*]:px-5 [&>*]:py-4",
          variant === "danger"
            ? "divide-destructive/20 border-destructive/30"
            : "divide-border-solid border-border-solid"
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** One setting: its title and description on the left, the control for it on the right */
export function SettingsRow({
  title,
  description,
  destructive = false,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Shows the title in the destructive color, for actions like deleting an account */
  destructive?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-8">
      <div className="min-w-0 space-y-1">
        <div className={cn("text-base", destructive && "text-destructive")}>{title}</div>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}
