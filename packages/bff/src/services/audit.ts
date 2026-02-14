import { PrismaClient } from "@prisma/client";
import type { Context } from "hono";

const prisma = new PrismaClient();

export type AuditAction =
  | "user.login"
  | "user.onboarding_completed"
  | "user.account_type_changed"
  | "user.data_export"
  | "user.account_deleted"
  | "org.created"
  | "org.updated"
  | "org.deleted"
  | "org.avatar.updated"
  | "org.avatar.deleted"
  | "org.member.added"
  | "org.member.updated"
  | "org.member.removed"
  | "org.invite.created"
  | "org.invite.accepted"
  | "org.invite.revoked"
  | "repo.settings.updated"
  | "subscription.created"
  | "subscription.updated"
  | "subscription.cancelled"
  | "subscription.resubscribed"
  | "subscription.seats.updated"
  | "seat.purchase.started"
  | "seat.cancelled"
  | "seat.reactivated"
  | "seat.reassigned"
  | "api_key.updated"
  | "api_key.deleted"
  | "review_rules.updated";

interface AuditLogParams {
  organizationId?: string;
  userId?: string;
  action: AuditAction;
  target?: string;
  metadata?: Record<string, unknown>;
  c?: Context;
}

export async function logAudit({
  organizationId,
  userId,
  action,
  target,
  metadata,
  c,
}: AuditLogParams): Promise<void> {
  try {
    const ipAddress =
      c?.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c?.req.header("x-real-ip") || null;
    const userAgent = c?.req.header("user-agent") || null;

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action,
        target,
        metadata: (metadata as object) ?? undefined,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}
