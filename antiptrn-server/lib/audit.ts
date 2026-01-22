import { PrismaClient } from "@prisma/client";
import type { Context } from "hono";

const prisma = new PrismaClient();

export type AuditAction =
  | "user.login"
  | "user.data_export"
  | "user.account_deleted"
  | "repo.settings.updated"
  | "subscription.created"
  | "subscription.updated"
  | "subscription.cancelled"
  | "subscription.resubscribed"
  | "api_key.updated"
  | "api_key.deleted"
  | "review_rules.updated";

interface AuditLogParams {
  userId?: string;
  action: AuditAction;
  target?: string;
  metadata?: Record<string, unknown>;
  c?: Context; // Hono context for IP/user agent
}

export async function logAudit({
  userId,
  action,
  target,
  metadata,
  c,
}: AuditLogParams): Promise<void> {
  try {
    const ipAddress = c?.req.header("x-forwarded-for")?.split(",")[0]?.trim()
      || c?.req.header("x-real-ip")
      || null;
    const userAgent = c?.req.header("user-agent") || null;

    await prisma.auditLog.create({
      data: {
        userId,
        action,
        target,
        metadata: metadata ?? undefined,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    // Don't let audit logging failures break the main flow
    console.error("Failed to write audit log:", error);
  }
}
