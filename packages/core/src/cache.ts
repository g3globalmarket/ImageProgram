import { simpleHash } from "./utils/hash";

export type TranslationCacheKey = { from: string; to: string; text: string };
export type ImageCacheKey = { query: string; cx: string };

export interface TranslationCache {
  get(key: TranslationCacheKey): Promise<string | null>;
  set(key: TranslationCacheKey, value: string): Promise<void>;
}

export interface ImageSearchCache {
  get(key: ImageCacheKey): Promise<string[] | null>;
  set(key: ImageCacheKey, urls: string[]): Promise<void>;
}

/**
 * Create a stable cache key for translation
 */
export function makeTranslationKey(from: string, to: string, text: string): string {
  const normalized = `${from}|${to}|${text.trim()}`;
  return simpleHash(normalized);
}

/**
 * Create a stable cache key for image search
 */
export function makeImageKey(cx: string, query: string): string {
  const normalized = `${cx}|${query.trim()}`;
  return simpleHash(normalized);
}

