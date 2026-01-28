/**
 * Simple hash function for generating stable identifiers
 * Uses a simple djb2-like hash algorithm
 */
export function simpleHash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to positive hex string
  return Math.abs(hash).toString(16);
}

/**
 * Generate a stable sourceUrl fallback from product data
 */
export function generateStableSourceUrl(
  categoryUrl: string,
  title: string,
  price: number,
  firstImage?: string
): string {
  const hashInput = `${title}|${price}|${firstImage || ""}`;
  const hash = simpleHash(hashInput);
  return `${categoryUrl}#${hash}`;
}

