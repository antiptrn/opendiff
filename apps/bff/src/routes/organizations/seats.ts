/** Seat management: update seat count, preview proration, and assign/unassign/reassign seats to members. */
import { Hono } from "hono";
import { prisma } from "../../db";
import { getAuthUser, requireAuth } from "../../middleware/auth";
import {
  canManageBilling,
  canManageMembers,
  getAssignedSeatCount,
  getAvailableSeats,
} from "../../middleware/organization";
import {
  SEAT_PRICING,
  getPaymentProviderName,
  isYearlyProduct,
  paymentProvider,
} from "../../payments";
import { logAudit } from "../../services/audit";

const seatRoutes = new Hono();

// ==================== SEAT COUNT MANAGEMENT ====================

// Update seat count (add/remove seats with Stripe)
seatRoutes.post("/subscription/seats", requireAuth(), async (c) => {
  const currentUser = getAuthUser(c);
  const orgId = c.req.param("orgId");

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
    include: { organization: true },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can manage seat count" }, 403);
  }

  const org = membership.organization;

  if (!org.subscriptionId || org.subscriptionStatus !== "ACTIVE") {
    return c.json({ error: "No active subscription" }, 400);
  }

  const body = await c.req.json();
  const { count } = body;

  // Validate seat count
  const newSeatCount = Number.parseInt(count);
  if (Number.isNaN(newSeatCount) || newSeatCount < 1 || newSeatCount > 100) {
    return c.json({ error: "Seat count must be between 1 and 100" }, 400);
  }

  // Can't reduce below currently assigned seats
  const assignedSeats = await getAssignedSeatCount(orgId);
  if (newSeatCount < assignedSeats) {
    return c.json(
      {
        error: `Cannot reduce seats below currently assigned count (${assignedSeats})`,
        assignedSeats,
      },
      400
    );
  }

  if (newSeatCount === org.seatCount) {
    return c.json({ error: "No change in seat count" }, 400);
  }

  try {
    // Check subscription status in Stripe before attempting update
    // This catches cases where our DB says ACTIVE but Stripe has it as incomplete_expired
    if (getPaymentProviderName() === "stripe") {
      const subscription = await paymentProvider.getSubscription(org.subscriptionId);
      if (subscription.status !== "active") {
        if (subscription.status === "incomplete") {
          return c.json(
            {
              error:
                "Your subscription payment is incomplete. Please complete your subscription setup before updating seats.",
              requiresCheckout: true,
              subscriptionStatus: subscription.status,
            },
            400
          );
        }
        return c.json(
          {
            error: `Cannot update seats: subscription is ${subscription.status}`,
            subscriptionStatus: subscription.status,
          },
          400
        );
      }
    }

    // Update Stripe subscription quantity
    await paymentProvider.updateSubscription({
      subscriptionId: org.subscriptionId,
      quantity: newSeatCount,
    });

    // Update database
    await prisma.organization.update({
      where: { id: orgId },
      data: { seatCount: newSeatCount },
    });

    await logAudit({
      organizationId: orgId,
      userId: currentUser.id,
      action: "subscription.seats.updated",
      metadata: {
        previousCount: org.seatCount,
        newCount: newSeatCount,
      },
      c,
    });

    return c.json({
      success: true,
      seatCount: newSeatCount,
      previousCount: org.seatCount,
    });
  } catch (error) {
    console.error("Error updating seat count:", error);

    // Handle Stripe-specific errors
    const errorObj = error as { type?: string; message?: string };
    if (errorObj?.type === "StripeInvalidRequestError") {
      const errorMessage = errorObj.message || "";

      // Check for incomplete_expired subscription error
      if (errorMessage.includes("incomplete_expired") || errorMessage.includes("incomplete")) {
        return c.json(
          {
            error:
              "Your subscription payment is incomplete. Please complete your subscription setup before updating seats.",
            requiresCheckout: true,
          },
          400
        );
      }

      // Return Stripe's error message if available
      if (errorMessage) {
        return c.json({ error: errorMessage }, 400);
      }
    }

    return c.json({ error: "Failed to update seat count" }, 500);
  }
});

// Preview seat change proration
seatRoutes.get("/subscription/seats/preview", requireAuth(), async (c) => {
  const currentUser = getAuthUser(c);
  const orgId = c.req.param("orgId");

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
    include: { organization: true },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can preview seat changes" }, 403);
  }

  const org = membership.organization;

  if (!org.subscriptionId || org.subscriptionStatus !== "ACTIVE") {
    return c.json({ error: "No active subscription" }, 400);
  }

  const countParam = c.req.query("count");
  const newSeatCount = Number.parseInt(countParam || "");

  if (Number.isNaN(newSeatCount) || newSeatCount < 1 || newSeatCount > 100) {
    return c.json({ error: "count query parameter must be between 1 and 100" }, 400);
  }

  try {
    const preview = await paymentProvider.previewSubscriptionChange({
      subscriptionId: org.subscriptionId,
      quantity: newSeatCount,
    });

    return c.json(preview);
  } catch (_error) {
    // If preview fails (e.g., Polar doesn't support it), calculate manually

    const currentSeatCount = org.seatCount ?? 0;
    const tier = org.subscriptionTier;

    if (!tier || currentSeatCount === 0 || tier === "FREE") {
      return c.json({ error: "Invalid subscription state for preview" }, 400);
    }

    // Get price per seat based on tier and billing cycle
    const isYearly = isYearlyProduct(org.productId);
    const tierKey = tier as keyof typeof SEAT_PRICING;
    const pricePerSeatCents: number = SEAT_PRICING[tierKey]?.[isYearly ? "yearly" : "monthly"] ?? 0;

    if (pricePerSeatCents === 0) {
      return c.json({ error: "Unable to determine price for tier" }, 400);
    }

    // Calculate proration
    let proratedCharge = 0;
    const seatDifference = newSeatCount - currentSeatCount;

    if (seatDifference !== 0) {
      // Try to get subscription details for accurate period calculation
      let periodEnd: Date | null = null;
      let periodStart: Date | null = null;

      try {
        if (!org.subscriptionId) {
          throw new Error("No subscription ID");
        }
        const subscription = await paymentProvider.getSubscription(org.subscriptionId);
        periodEnd = subscription.currentPeriodEnd;
        // Estimate period start (1 month or 1 year before end)
        if (periodEnd) {
          periodStart = new Date(periodEnd);
          if (isYearly) {
            periodStart.setFullYear(periodStart.getFullYear() - 1);
          } else {
            periodStart.setMonth(periodStart.getMonth() - 1);
          }
        }
      } catch (subError) {
        // Fall back to using org.subscriptionExpiresAt
        console.log("Could not fetch subscription details, using org data:", subError);
        if (org.subscriptionExpiresAt) {
          periodEnd = new Date(org.subscriptionExpiresAt);
          periodStart = new Date(periodEnd);
          if (isYearly) {
            periodStart.setFullYear(periodStart.getFullYear() - 1);
          } else {
            periodStart.setMonth(periodStart.getMonth() - 1);
          }
        }
      }

      if (periodEnd && periodStart) {
        const now = new Date();
        const totalPeriodMs = periodEnd.getTime() - periodStart.getTime();
        const remainingPeriodMs = periodEnd.getTime() - now.getTime();

        if (totalPeriodMs > 0 && remainingPeriodMs > 0) {
          const prorationRatio = remainingPeriodMs / totalPeriodMs;

          // Prorated amount = (seat difference) * (price per seat) * (time remaining / total period)
          proratedCharge = Math.round(seatDifference * pricePerSeatCents * prorationRatio);
        }
      }
    }

    // Calculate next billing amount
    const nextBillingAmount = newSeatCount * pricePerSeatCents;

    return c.json({
      currentSeats: currentSeatCount,
      newSeats: newSeatCount,
      proratedCharge,
      nextBillingAmount,
      effectiveNow: true,
    });
  }
});

// ==================== SEAT ASSIGNMENT ====================

// Assign a seat to a member
seatRoutes.post("/seats/:userId/assign", requireAuth(), async (c) => {
  const currentUser = getAuthUser(c);
  const orgId = c.req.param("orgId");
  const targetUserId = c.req.param("userId");

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
    include: { organization: true },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can assign seats" }, 403);
  }

  // Check if org has a subscription
  const org = membership.organization;
  if (!org.subscriptionTier || org.subscriptionStatus !== "ACTIVE") {
    return c.json({ error: "Organization has no active subscription" }, 400);
  }

  // Check seat availability
  const seats = await getAvailableSeats(orgId);
  if (seats.available <= 0) {
    return c.json(
      {
        error: "No seats available. Purchase more seats to assign.",
        seats,
      },
      400
    );
  }

  // Get target member
  const targetMember = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: targetUserId },
    },
    include: { user: true },
  });

  if (!targetMember) {
    return c.json({ error: "User is not a member of this organization" }, 404);
  }

  if (targetMember.hasSeat) {
    return c.json({ error: "User already has a seat assigned" }, 400);
  }

  // Assign seat
  await prisma.organizationMember.update({
    where: {
      organizationId_userId: { organizationId: orgId, userId: targetUserId },
    },
    data: { hasSeat: true },
  });

  await logAudit({
    organizationId: orgId,
    userId: currentUser.id,
    action: "org.member.updated",
    target: targetUserId,
    metadata: { action: "seat_assigned", userLogin: targetMember.user.login },
    c,
  });

  return c.json({
    success: true,
    message: `Seat assigned to ${targetMember.user.login}`,
  });
});

// Unassign a seat from a member
seatRoutes.post("/seats/:userId/unassign", requireAuth(), async (c) => {
  const currentUser = getAuthUser(c);
  const orgId = c.req.param("orgId");
  const targetUserId = c.req.param("userId");

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can unassign seats" }, 403);
  }

  // Get target member
  const targetMember = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: targetUserId },
    },
    include: { user: true },
  });

  if (!targetMember) {
    return c.json({ error: "User is not a member of this organization" }, 404);
  }

  if (!targetMember.hasSeat) {
    return c.json({ error: "User does not have a seat assigned" }, 400);
  }

  // Unassign seat
  await prisma.organizationMember.update({
    where: {
      organizationId_userId: { organizationId: orgId, userId: targetUserId },
    },
    data: { hasSeat: false },
  });

  await logAudit({
    organizationId: orgId,
    userId: currentUser.id,
    action: "org.member.updated",
    target: targetUserId,
    metadata: { action: "seat_unassigned", userLogin: targetMember.user.login },
    c,
  });

  return c.json({
    success: true,
    message: `Seat unassigned from ${targetMember.user.login}`,
  });
});

// Reassign a seat from one member to another
seatRoutes.post("/seats/:userId/reassign", requireAuth(), async (c) => {
  const currentUser = getAuthUser(c);
  const orgId = c.req.param("orgId");
  const sourceUserId = c.req.param("userId");

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageMembers(membership.role)) {
    return c.json({ error: "Only owners and admins can reassign seats" }, 403);
  }

  const body = await c.req.json<{ targetUserId: string }>();
  const { targetUserId } = body;

  if (!targetUserId) {
    return c.json({ error: "targetUserId is required" }, 400);
  }

  if (sourceUserId === targetUserId) {
    return c.json({ error: "Cannot reassign seat to the same user" }, 400);
  }

  // Get source member
  const sourceMember = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: sourceUserId },
    },
    include: { user: true },
  });

  if (!sourceMember) {
    return c.json({ error: "Source user is not a member of this organization" }, 404);
  }

  if (!sourceMember.hasSeat) {
    return c.json({ error: "Source user does not have a seat" }, 400);
  }

  // Get target member
  const targetMember = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: targetUserId },
    },
    include: { user: true },
  });

  if (!targetMember) {
    return c.json({ error: "Target user is not a member of this organization" }, 404);
  }

  if (targetMember.hasSeat) {
    return c.json({ error: "Target user already has a seat" }, 400);
  }

  // Reassign seat
  await prisma.$transaction([
    prisma.organizationMember.update({
      where: {
        organizationId_userId: { organizationId: orgId, userId: sourceUserId },
      },
      data: { hasSeat: false },
    }),
    prisma.organizationMember.update({
      where: {
        organizationId_userId: { organizationId: orgId, userId: targetUserId },
      },
      data: { hasSeat: true },
    }),
  ]);

  await logAudit({
    organizationId: orgId,
    userId: currentUser.id,
    action: "seat.reassigned",
    target: targetUserId,
    metadata: {
      fromUserId: sourceUserId,
      fromUserLogin: sourceMember.user.login,
      toUserId: targetUserId,
      toUserLogin: targetMember.user.login,
    },
    c,
  });

  return c.json({
    success: true,
    message: `Seat reassigned from ${sourceMember.user.login} to ${targetMember.user.login}`,
  });
});

export { seatRoutes };
