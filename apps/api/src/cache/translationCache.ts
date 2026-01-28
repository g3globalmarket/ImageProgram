import type { TranslationCache, TranslationCacheKey } from "@repo/core";
import { makeTranslationKey } from "@repo/core";
import { TranslationCacheEntry } from "../models/TranslationCacheEntry";

export class MongoTranslationCache implements TranslationCache {
  private ttlDays: number;
  private debug: boolean;
  private hitCount: number = 0;
  private missCount: number = 0;

  constructor(ttlDays: number, debug: boolean = false) {
    this.ttlDays = ttlDays;
    this.debug = debug;
  }

  async get(key: TranslationCacheKey): Promise<string | null> {
    try {
      const cacheKey = makeTranslationKey(key.from, key.to, key.text);
      const entry = await TranslationCacheEntry.findOne({ key: cacheKey }).lean();

      if (entry && entry.expiresAt > new Date()) {
        // Update hits (best effort, don't block)
        TranslationCacheEntry.updateOne(
          { key: cacheKey },
          { $inc: { hits: 1 }, $set: { lastHitAt: new Date() } }
        ).catch(() => {
          // Ignore update errors
        });

        this.hitCount++;
        if (this.debug) {
          console.log(`[Cache] Translation HIT: ${key.from}->${key.to}`);
        }
        return entry.value;
      }

      this.missCount++;
      if (this.debug) {
        console.log(`[Cache] Translation MISS: ${key.from}->${key.to}`);
      }
      return null;
    } catch (error) {
      // Cache failure should not break the pipeline
      if (this.debug) {
        console.error(`[Cache] Translation GET error:`, error);
      }
      this.missCount++;
      return null;
    }
  }

  async set(key: TranslationCacheKey, value: string): Promise<void> {
    try {
      const cacheKey = makeTranslationKey(key.from, key.to, key.text);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.ttlDays);

      await TranslationCacheEntry.findOneAndUpdate(
        { key: cacheKey },
        {
          key: cacheKey,
          from: key.from,
          to: key.to,
          value,
          expiresAt,
          $inc: { hits: 0 }, // Initialize hits if new
        },
        { upsert: true, new: true }
      );

      if (this.debug) {
        console.log(`[Cache] Translation SET: ${key.from}->${key.to}`);
      }
    } catch (error) {
      // Cache write failure should not break the pipeline
      if (this.debug) {
        console.error(`[Cache] Translation SET error:`, error);
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

