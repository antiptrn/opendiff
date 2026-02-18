import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL?.trim();

let redisClient: Redis | null = null;
let redisInitFailed = false;

export function getRedisClient(): Redis | null {
  if (!REDIS_URL || redisInitFailed) {
    return null;
  }

  if (!redisClient) {
    try {
      redisClient = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        enableAutoPipelining: true,
      });

      redisClient.on("error", (error: unknown) => {
        console.error("Redis client error:", error);
      });
    } catch (error) {
      redisInitFailed = true;
      console.error("Failed to initialize Redis client:", error);
      return null;
    }
  }

  return redisClient;
}
