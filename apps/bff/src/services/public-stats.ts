/** Platform-wide totals for the marketing site, counted across every organization. */
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { countMergedPullRequests } from "./merged-pull-requests";

const STATS_TTL_MS = 60_000;

export interface PublicStats {
  /** Pull requests Contrast reviewed that were then merged */
  prsMerged: number;
  /** Issues Contrast has flagged in reviews */
  issuesFound: number;
  /** Fixes Contrast committed after they were accepted */
  fixesCommitted: number;
}

type PublicStatsDb = Pick<PrismaClient, "reviewComment" | "reviewFix">;

/** Builds the totals around a database client and merged count, cached for a minute. */
export function createPublicStatsService(
  getDb: () => PublicStatsDb,
  countMerged: () => Promise<number>
) {
  let cached: { value: PublicStats; expires: number } | null = null;

  return async function getPublicStats(): Promise<PublicStats> {
    if (cached && cached.expires > Date.now()) return cached.value;
    const db = getDb();
    const [prsMerged, issuesFound, fixesCommitted] = await Promise.all([
      countMerged(),
      db.reviewComment.count(),
      db.reviewFix.count({ where: { status: "ACCEPTED" } }),
    ]);
    const value = { prsMerged, issuesFound, fixesCommitted };
    cached = { value, expires: Date.now() + STATS_TTL_MS };
    return value;
  };
}

export const getPublicStats = createPublicStatsService(() => prisma, countMergedPullRequests);
