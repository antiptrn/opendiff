/**
 * Data migration script: Mark existing personal orgs as isPersonal=true
 *
 * Run with: npx tsx scripts/mark-personal-orgs.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function markPersonalOrgs() {
  console.log("Marking personal orgs...\n");

  // Find all users with personalOrgId set
  const usersWithPersonalOrg = await prisma.user.findMany({
    where: {
      personalOrgId: { not: null },
    },
    select: {
      id: true,
      login: true,
      personalOrgId: true,
    },
  });

  console.log(`Found ${usersWithPersonalOrg.length} users with personal orgs\n`);

  for (const user of usersWithPersonalOrg) {
    if (!user.personalOrgId) continue;

    const org = await prisma.organization.findUnique({
      where: { id: user.personalOrgId },
    });

    if (org && !org.isPersonal) {
      await prisma.organization.update({
        where: { id: user.personalOrgId },
        data: { isPersonal: true },
      });
      console.log(`  Marked org "${org.name}" (${org.id}) as personal for user ${user.login}`);
    } else if (org?.isPersonal) {
      console.log(`  Org "${org.name}" already marked as personal for user ${user.login}`);
    } else {
      console.log(`  Warning: Personal org ${user.personalOrgId} not found for user ${user.login}`);
    }
  }

  console.log("\nDone!");
}

markPersonalOrgs()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
