// Audit log types
export interface AuditLogUser {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface AuditLog {
  id: string;
  action: string;
  target: string | null;
  metadata: Record<string, unknown> | null;
  user: AuditLogUser | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
