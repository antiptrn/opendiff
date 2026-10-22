import { TopBarSearch } from "components/components/console";
import { ConsoleTopBarSearch } from "@/components/layout/console";
import { type AuditLog, useAuditLogs } from "@/features/admin";
import { Badge } from "components/components/ui/badge";
import type { DataTableColumn } from "components/components/ui/data-table";
import { useDebounce } from "components/hooks";
import { useState } from "react";
import { useAuth } from "shared/auth";
import { useOrganization } from "shared/organizations";
import { PaginatedTable, TableEmpty } from "@/components/paginated-table";

/**
 * Maps action strings to human-readable labels and badge variants
 */
function formatAction(action: string): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  const actionMap: Record<
    string,
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    "user.login": { label: "Login", variant: "secondary" },
    "user.data_export": { label: "Data Export", variant: "secondary" },
    "user.account_deleted": { label: "Account Deleted", variant: "destructive" },
    "org.created": { label: "Org Created", variant: "outline" },
    "org.updated": { label: "Org Updated", variant: "outline" },
    "org.deleted": { label: "Org Deleted", variant: "destructive" },
    "org.member.added": { label: "Member Added", variant: "outline" },
    "org.member.updated": { label: "Member Updated", variant: "outline" },
    "org.member.removed": { label: "Member Removed", variant: "destructive" },
    "org.invite.created": { label: "Invite Created", variant: "outline" },
    "org.invite.accepted": { label: "Invite Accepted", variant: "outline" },
    "org.invite.revoked": { label: "Invite Revoked", variant: "destructive" },
    "repo.settings.updated": { label: "Repo Settings", variant: "outline" },
    "subscription.created": { label: "Subscription Created", variant: "outline" },
    "subscription.updated": { label: "Subscription Updated", variant: "outline" },
    "subscription.cancelled": { label: "Subscription Cancelled", variant: "destructive" },
    "subscription.resubscribed": { label: "Resubscribed", variant: "outline" },
    "api_key.updated": { label: "API Key Updated", variant: "outline" },
    "api_key.deleted": { label: "API Key Deleted", variant: "destructive" },
    "review_rules.updated": { label: "Review Rules Updated", variant: "outline" },
  };

  return actionMap[action] || { label: action, variant: "secondary" };
}

/**
 * Formats a date string into a human-readable relative time
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

const COLUMNS: DataTableColumn<AuditLog>[] = [
  {
    key: "action",
    header: "Action",
    cell: (log) => {
      const { label, variant } = formatAction(log.action);
      return (
        <Badge variant={variant} className="font-normal">
          {label}
        </Badge>
      );
    },
  },
  {
    key: "user",
    header: "User",
    cell: (log) =>
      log.user ? (
        <span className="flex items-center gap-2">
          {log.user.avatarUrl && (
            <img src={log.user.avatarUrl} alt="" className="size-5 rounded-full" />
          )}
          {log.user.name || log.user.login}
        </span>
      ) : (
        <span className="text-muted-foreground">System</span>
      ),
  },
  {
    key: "target",
    header: "Target",
    cell: (log) => <span className="block max-w-80 truncate">{log.target || "—"}</span>,
  },
  { key: "time", header: "Time", cell: (log) => formatDate(log.createdAt) },
];

/** Audit log table for one search; keyed by the search so its page resets when that changes */
function AuditLogTable({ search }: { search: string }) {
  const { user } = useAuth();
  const { currentOrg } = useOrganization();
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useAuditLogs(user?.access_token, currentOrg?.id, {
    page,
    search,
  });

  return (
    <PaginatedTable
      label="Audit logs"
      rows={data?.logs}
      columns={COLUMNS}
      getKey={(log) => log.id}
      pagination={data?.pagination}
      isLoading={isLoading}
      error={error}
      empty={
        search ? (
          <TableEmpty
            title="No matching activity"
            description={`Nothing in the audit log matches "${search}".`}
          />
        ) : (
          <TableEmpty
            title="No activity yet"
            description="Changes to your organization, members, repositories and billing will show up here."
          />
        )
      }
      onPageChange={setPage}
    />
  );
}

/** Admin page: the organization's audit log, searchable and paginated */
export function AdminPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery.trim(), 300);

  return (
    <div>
      <ConsoleTopBarSearch>
        <TopBarSearch
          shortcut="f"
          placeholder="Search audit logs"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </ConsoleTopBarSearch>
      <AuditLogTable key={debouncedSearch} search={debouncedSearch} />
    </div>
  );
}
