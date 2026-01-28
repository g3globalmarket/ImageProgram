import Redis from "ioredis";
import { config } from "../config";

let redisConnection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redisConnection) {
    redisConnection = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redisConnection.on("error", (error) => {
      console.error("[Redis] Connection error:", error);
    });

    redisConnection.on("connect", () => {
      if (config.debugQueue) {
        console.log("[Redis] Connected");
      }
    });
  }
  return redisConnection;
}

export async function pingRedis(): Promise<boolean> {
  try {
    const redis = getRedisConnection();
    const result = await redis.ping();
    return result === "PONG";
  } catch (error) {
    return false;
  }
}

export async function closeRedisConnection(): Promise<void> {
  if (redisConnection) {
    await redisConnection.quit();
  }
}

