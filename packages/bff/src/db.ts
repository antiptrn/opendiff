import { PrismaClient } from "@prisma/client";

// Enable BigInt JSON serialization (required for Prisma BigInt fields like githubCommentId)
// biome-ignore lint/suspicious/noExplicitAny: Required for prototype extension
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

export const prisma = new PrismaClient();
