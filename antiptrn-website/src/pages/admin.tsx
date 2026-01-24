import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useOrganization } from "@/hooks/use-organization";
import { useAuditLogs, type AuditLog } from "@/hooks/use-api";

/**
 * Custom hook that debounces a value
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

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
    "org.created": { label: "Org Created", variant: "default" },
    "org.updated": { label: "Org Updated", variant: "outline" },
    "org.deleted": { label: "Org Deleted", variant: "destructive" },
    "org.member.added": { label: "Member Added", variant: "default" },
    "org.member.updated": { label: "Member Updated", variant: "outline" },
    "org.member.removed": { label: "Member Removed", variant: "destructive" },
    "org.invite.created": { label: "Invite Created", variant: "default" },
    "org.invite.accepted": { label: "Invite Accepted", variant: "default" },
    "org.invite.revoked": { label: "Invite Revoked", variant: "destructive" },
    "repo.settings.updated": { label: "Repo Settings", variant: "outline" },
    "subscription.created": { label: "Subscription Created", variant: "default" },
    "subscription.updated": { label: "Subscription Updated", variant: "outline" },
    "subscription.cancelled": { label: "Subscription Cancelled", variant: "destructive" },
    "subscription.resubscribed": { label: "Resubscribed", variant: "default" },
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
        <Skeleton className="h-5 w-24" />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-32" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-16" />
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
      <div className="border rounded-lg">
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
      </div>

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
      <h1 className="text-2xl mb-6">Admin</h1>
      <Card>
        <CardHeader>
          <CardTitle>Audit Logs</CardTitle>
          <CardDescription>Track all actions performed in your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by action, user, or target..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
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
