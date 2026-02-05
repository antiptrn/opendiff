import type { NotificationType } from "@prisma/client";
import { prisma } from "./db";

export function createNotification({
  organizationId,
  type,
  title,
  body,
  reviewId,
}: {
  organizationId: string;
  type: NotificationType;
  title: string;
  body: string;
  reviewId?: string;
}) {
  return prisma.notification.create({
    data: {
      organizationId,
      type,
      title,
      body,
      reviewId: reviewId ?? null,
    },
  });
}
