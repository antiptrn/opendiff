import { type AuditLog, useAuditLogs } from "@/features/admin";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Badge } from "opendiff-components/components/ui/badge";
import { Button } from "opendiff-components/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "opendiff-components/components/ui/card";
import { Input } from "opendiff-components/components/ui/input";
import { Skeleton } from "opendiff-components/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "opendiff-components/components/ui/table";
import { useDebounce } from "opendiff-components/hooks";
import { useAuth } from "opendiff-shared/auth";
import { useOrganization } from "opendiff-shared/organizations";
import { useState } from "react";

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

/**
 * Renders a single audit log row
 */
function AuditLogRow({ log }: { log: AuditLog }) {
  const { label, variant } = formatAction(log.action);

  return (
    <TableRow>
      <TableCell className="w-[140px]">
        <Badge variant={variant} className="font-normal">
          {label}
        </Badge>
      </TableCell>
      <TableCell>
        {log.user ? (
          <div className="flex items-center gap-2">
            {log.user.avatarUrl && (
              <img src={log.user.avatarUrl} alt={log.user.login} className="size-5 rounded-full" />
            )}
            <span className="text-sm">{log.user.name || log.user.login}</span>
          </div>
        ) : (
          <span className="text-muted-foreground text-sm">System</span>
        )}
      </TableCell>
      <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
        {log.target || "—"}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm w-[100px]">
        {formatDate(log.createdAt)}
      </TableCell>
    </TableRow>
  );
}

/**
 * Skeleton loader for audit log rows
 */
function AuditLogSkeleton() {
  return (
    <TableRow>
      <TableCell>
        <Skeleton className="h-6 w-24 rounded-md" />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-md" />
        </div>
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-32 rounded-md" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-16 rounded-md" />
      </TableCell>
    </TableRow>
  );
}

/**
 * Props for the paginated log table component
 */
interface PaginatedLogTableProps {
  search: string;
}

/**
 * Paginated log table that resets page when search changes via key prop
 */
function PaginatedLogTable({ search }: PaginatedLogTableProps) {
  const { user } = useAuth();
  const { currentOrg } = useOrganization();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useAuditLogs(user?.access_token, currentOrg?.id, {
    page,
    search,
  });

  const logs = data?.logs || [];
  const pagination = data?.pagination;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">Action</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Target</TableHead>
            <TableHead className="w-[100px]">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton placeholders don't reorder
            Array.from({ length: 10 }).map((_, i) => <AuditLogSkeleton key={i} />)
          ) : logs.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                {search ? "No results found" : "No audit logs yet"}
              </TableCell>
            </TableRow>
          ) : (
            logs.map((log) => <AuditLogRow key={log.id} log={log} />)
          )}
        </TableBody>
      </Table>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}{" "}
            entries
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Admin page component for viewing audit logs
 */
export function AdminPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-6 font-medium">Admin</h1>
      <Card>
        <CardHeader>
          <CardTitle>Audit Logs</CardTitle>
          <CardDescription>Track all actions performed in your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6">
            <div className="relative w-full">
              <Search
                strokeWidth={2.5}
                className="size-4.5 absolute left-5 top-1/2 -translate-y-1/2 text-foreground"
              />
              <Input
                className="pl-12.5 bg-background"
                placeholder="Search audit logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Use key prop to reset pagination when search changes */}
          <PaginatedLogTable key={debouncedSearch} search={debouncedSearch} />
        </CardContent>
      </Card>
    </div>
  );
}
