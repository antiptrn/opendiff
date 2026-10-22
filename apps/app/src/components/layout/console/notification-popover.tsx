import { Loading03Icon } from "@hugeicons/core-free-icons";
import { TableEmpty } from "@/components/paginated-table";
import { Popover, PopoverContent, PopoverTrigger } from "components/components";
import { NotificationButton } from "components/components/console";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "shared/auth";
import { useOrganization } from "shared/organizations";
import {
  type Notification,
  useMarkNotificationRead,
  useNotifications,
} from "../../../features/notifications/hooks/use-notifications";

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function NotificationItem({
  notification,
  onVisible,
  onClick,
}: {
  notification: Notification;
  onVisible: (id: string) => void;
  onClick: (n: Notification) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || notification.readAt) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onVisible(notification.id);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [notification.id, notification.readAt, onVisible]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onClick(notification)}
      className={`w-full flex items-start gap-3 px-5 py-4 text-left transition-colors ${!notification.readAt ? "bg-accent/20" : ""
        }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="text-base truncate">{notification.title}</span>
          {!notification.readAt && <span className="size-1.5 rounded-full bg-blue-500 shrink-0" />}
        </div>
        <p className="text-sm text-foreground truncate mt-1">{notification.body}</p>
        <p className="text-sm text-muted-foreground mt-1">
          {formatTimeAgo(notification.createdAt)}
        </p>
      </div>
    </button>
  );
}

function ScrollSentinel({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onVisible();
      },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible]);

  return <div ref={ref} className="h-px" />;
}

export function NotificationPopover() {
  const { user } = useAuth();
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const token = user?.access_token;
  const orgId = currentOrg?.id;

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotifications(token, orgId);
  const markRead = useMarkNotificationRead(token, orgId);

  const notifications = data?.pages.flatMap((p) => p.notifications) ?? [];
  const unreadCount = data?.pages[0]?.unreadCount ?? 0;

  const handleVisible = useCallback((id: string) => markRead.mutate(id), [markRead]);

  const handleClick = (notification: Notification) => {
    if (notification.reviewId) {
      setOpen(false);
      navigate(`/console/pull-requests/${notification.reviewId}`);
    }
  };

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <NotificationButton hasUnread={unreadCount > 0} />
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-80 p-0 min-h-24">
        <div className="max-h-80 overflow-y-auto h-full">
          {notifications.length === 0 ? (
            <TableEmpty
              title="No notifications"
              description="Reviews, fixes and team updates show up here."
            />
          ) : (
            <>
              {notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onVisible={handleVisible}
                  onClick={handleClick}
                />
              ))}
              {hasNextPage && <ScrollSentinel onVisible={loadMore} />}
              {isFetchingNextPage && (
                <div className="py-3 flex justify-center">
                  <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
