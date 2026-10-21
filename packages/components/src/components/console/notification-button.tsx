import { BellIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";
import { SidebarMenuButton } from "../ui/sidebar";

/** Bell button in the sidebar footer, with a dot while there are unread notifications */
export function NotificationButton({
  hasUnread = false,
  ...props
}: ComponentProps<typeof SidebarMenuButton> & { hasUnread?: boolean }) {
  return (
    <SidebarMenuButton
      aria-label="Notifications"
      type="button"
      variant="sidebarAction"
      className="relative"
      {...props}
    >
      <span className="flex text-muted-foreground group-hover/menu-button:text-foreground [&>svg]:size-4">
        <HugeiconsIcon icon={BellIcon} />
      </span>
      {hasUnread && <div className="absolute top-1 right-1 size-1.5 rounded-full bg-blue-400" />}
    </SidebarMenuButton>
  );
}
