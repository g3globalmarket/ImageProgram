import type { Store } from "@repo/shared";

/**
 * Registry of which stores have real scrapers implemented.
 * Stores with false will be blocked from imports to prevent fake data.
 */
export const SCRAPER_SUPPORT: Record<Store, boolean> = {
  gmarket: true, // Real scraper exists (may be blocked 403 sometimes)
  oliveyoung: true, // Real scraper will be implemented
  "11st": false, // Still stub -> disable
} as const;

/**
 * Check if a store has a real scraper implemented
 */
export function isScraperSupported(store: Store): boolean {
  return SCRAPER_SUPPORT[store] === true;
}

