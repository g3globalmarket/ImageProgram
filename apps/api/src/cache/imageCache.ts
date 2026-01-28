import type { ImageSearchCache, ImageCacheKey } from "@repo/core";
import { makeImageKey } from "@repo/core";
import { ImageCacheEntry } from "../models/ImageCacheEntry";

export class MongoImageCache implements ImageSearchCache {
  private ttlDays: number;
  private debug: boolean;
  private hitCount: number = 0;
  private missCount: number = 0;

  constructor(ttlDays: number, debug: boolean = false) {
    this.ttlDays = ttlDays;
    this.debug = debug;
  }

  async get(key: ImageCacheKey): Promise<string[] | null> {
    try {
      const cacheKey = makeImageKey(key.cx, key.query);
      const entry = await ImageCacheEntry.findOne({ key: cacheKey }).lean();

      if (entry && entry.expiresAt > new Date()) {
        // Update hits (best effort, don't block)
        ImageCacheEntry.updateOne(
          { key: cacheKey },
          { $inc: { hits: 1 }, $set: { lastHitAt: new Date() } }
        ).catch(() => {
          // Ignore update errors
        });

        this.hitCount++;
        if (this.debug) {
          console.log(`[Cache] Image HIT: query="${key.query.substring(0, 50)}..."`);
        }
        return entry.urls;
      }

      this.missCount++;
      if (this.debug) {
        console.log(`[Cache] Image MISS: query="${key.query.substring(0, 50)}..."`);
      }
      return null;
    } catch (error) {
      // Cache failure should not break the pipeline
      if (this.debug) {
        console.error(`[Cache] Image GET error:`, error);
      }
      this.missCount++;
      return null;
    }
  }

  async set(key: ImageCacheKey, urls: string[]): Promise<void> {
    try {
      const cacheKey = makeImageKey(key.cx, key.query);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.ttlDays);

      await ImageCacheEntry.findOneAndUpdate(
        { key: cacheKey },
        {
          key: cacheKey,
          cx: key.cx,
          query: key.query,
          urls,
          expiresAt,
          $inc: { hits: 0 }, // Initialize hits if new
        },
        { upsert: true, new: true }
      );

      if (this.debug) {
        console.log(`[Cache] Image SET: query="${key.query.substring(0, 50)}..."`);
      }
    } catch (error) {
      // Cache write failure should not break the pipeline
      if (this.debug) {
        console.error(`[Cache] Image SET error:`, error);
      }
      // Silently ignore
    }
  }

  getStats() {
    return {
      hits: this.hitCount,
      misses: this.missCount,
    };
  }

  resetStats() {
    this.hitCount = 0;
    this.missCount = 0;
  }
}

