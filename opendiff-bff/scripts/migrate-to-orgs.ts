/**
 * Data migration script: Migrate existing users to organizations
 *
 * Run with: npx tsx scripts/migrate-to-orgs.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function migrateToOrganizations() {
  console.log("Starting migration to organizations...\n");

  // Get all users
  const users = await prisma.user.findMany({
    include: {
      memberships: true,
    },
  });

  console.log(`Found ${users.length} users to process\n`);

  for (const user of users) {
    // Skip users who already have an organization
    if (user.memberships.length > 0) {
      console.log(`- Skipping ${user.login}: already has organization membership`);
      continue;
    }

    console.log(`- Processing ${user.login}...`);

    // Generate a unique slug
    let baseSlug = slugify(user.login);
    let slug = baseSlug;
    let counter = 1;

    while (await prisma.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Determine if user has an active subscription
    const hasActiveSub = !!(user.subscriptionTier &&
      user.subscriptionTier !== "FREE" &&
      user.subscriptionStatus === "ACTIVE");

    // Create organization with subscription data (org-level subscriptions)
    const org = await prisma.organization.create({
      data: {
        name: `${user.name || user.login}'s Organization`,
        slug,
        reviewsUsedThisCycle: user.reviewsUsedThisCycle || 0,
        anthropicApiKey: user.anthropicApiKey,
        customReviewRules: user.customReviewRules,
        // Transfer subscription data to organization
        subscriptionTier: user.subscriptionTier && user.subscriptionTier !== "FREE" ? user.subscriptionTier : null,
        subscriptionStatus: user.subscriptionStatus && user.subscriptionStatus !== "INACTIVE" ? user.subscriptionStatus : null,
        subscriptionId: user.subscriptionId,
        productId: user.productId,
        subscriptionExpiresAt: user.subscriptionExpiresAt,
        cancelAtPeriodEnd: user.cancelAtPeriodEnd ?? false,
        seatCount: hasActiveSub ? 1 : 0,
      },
    });

    console.log(`  Created organization: ${org.name} (${org.slug})`);

    // Make user the owner with a seat if they have an active subscription
    await prisma.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        role: "OWNER",
        hasSeat: hasActiveSub,
      },
    });

    console.log(`  Made ${user.login} the OWNER${hasActiveSub ? " with seat" : ""}`);

    // Transfer repository settings to organization
    const repoSettings = await prisma.repositorySettings.findMany({
      where: { userId: user.id },
    });

    if (repoSettings.length > 0) {
      await prisma.repositorySettings.updateMany({
        where: { userId: user.id },
        data: {
          organizationId: org.id,
          enabledById: user.id,
        },
      });

      console.log(`  Transferred ${repoSettings.length} repository settings`);
    }

    // Update audit logs to include organization
    await prisma.auditLog.updateMany({
      where: { userId: user.id },
      data: { organizationId: org.id },
    });

    console.log(`  Updated audit logs\n`);
  }

  // Handle any repository settings without an organization (orphaned)
  const orphanedSettings = await prisma.repositorySettings.findMany({
    where: { organizationId: null },
  });

  if (orphanedSettings.length > 0) {
    console.log(`\nFound ${orphanedSettings.length} orphaned repository settings`);
    // These would need manual handling or could be deleted
    for (const setting of orphanedSettings) {
      console.log(`  - ${setting.owner}/${setting.repo} (userId: ${setting.userId})`);
    }
  }

  console.log("\nMigration complete!");

  // Summary
  const orgCount = await prisma.organization.count();
  const memberCount = await prisma.organizationMember.count();

  console.log(`\nSummary:`);
  console.log(`- Organizations created: ${orgCount}`);
  console.log(`- Organization members: ${memberCount}`);
}

migrateToOrganizations()
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
