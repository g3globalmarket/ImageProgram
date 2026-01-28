/**
 * URL normalization utilities for product images
 */

/**
 * Normalize an HTTP/HTTPS URL string.
 * Handles protocol-relative URLs (//example.com) and relative URLs.
 * Returns null if the input is not a valid HTTP(S) URL.
 *
 * @param input - URL string (may be null, undefined, or empty)
 * @returns Normalized absolute URL or null if invalid
 */
export function normalizeHttpUrl(input?: string | null): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return null; // we only accept absolute http(s) here
}

/**
 * Normalize an HTTP/HTTPS URL string with a base URL for relative paths.
 * Useful for converting relative URLs to absolute URLs.
 *
 * @param input - URL string (may be null, undefined, or empty)
 * @param baseUrl - Base URL to use for relative paths (e.g., "https://www.oliveyoung.co.kr")
 * @returns Normalized absolute URL or null if invalid
 */
export function normalizeHttpUrlWithBase(
  input?: string | null,
  baseUrl?: string
): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;

  // Protocol-relative URL
  if (s.startsWith("//")) return "https:" + s;

  // Already absolute
  if (s.startsWith("http://") || s.startsWith("https://")) return s;

  // Relative URL - prepend base if provided
  if (s.startsWith("/") && baseUrl) {
    // Remove trailing slash from baseUrl if present
    const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    return base + s;
  }

  // Relative URL without leading slash - prepend base if provided
  if (baseUrl) {
    const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
    return base + s;
  }

  return null;
}

/**
 * Extract URL from markdown link format: [text](url) -> url
 * Handles multiple markdown variants:
 * - [text](https://url) -> https://url
 * - (https://url) -> https://url
 * - [https://url](https://url) -> https://url (when text is also a URL)
 *
 * @param markdownLink - Markdown link string
 * @returns Extracted URL or original string
 */
export function extractUrlFromMarkdown(markdownLink: string): string {
  if (!markdownLink) return "";
  const trimmed = markdownLink.trim();
  
  // Standard markdown link: [text](url)
  // Also handles cases where text is also a URL: [https://...](https://...)
  const standardMatch = trimmed.match(/^\[.*?\]\((https?:\/\/[^)]+)\)$/);
  if (standardMatch) {
    return standardMatch[1]; // Return the URL part
  }
  
  // Variant: just parentheses with URL: (https://url)
  const parenMatch = trimmed.match(/^\((https?:\/\/[^)]+)\)$/);
  if (parenMatch) {
    return parenMatch[1];
  }
  
  // Variant: [text](url) without http prefix (less common but handle it)
  const noHttpMatch = trimmed.match(/^\[.*?\]\(([^)]+)\)$/);
  if (noHttpMatch) {
    const url = noHttpMatch[1];
    // If it looks like a URL, return it
    if (url.startsWith("//") || url.startsWith("/") || url.includes(".")) {
      return url;
    }
  }
  
  // If not markdown, return as-is
  return trimmed;
}

/**
 * Deduplicate an array of URLs.
 * Removes empty/null values and duplicates.
 *
 * @param urls - Array of URL strings
 * @returns Deduplicated array of non-empty URLs
 */
export function dedupeUrls(urls: string[]): string[] {
  const set = new Set<string>();
  for (const u of urls) {
    if (u && u.trim()) {
      set.add(u.trim());
    }
  }
  return [...set];
}

/**
 * Normalize and deduplicate an array of image URLs.
 * Handles markdown format, relative URLs, and deduplication.
 *
 * @param urls - Array of URL strings (may include markdown format)
 * @param baseUrl - Optional base URL for relative paths
 * @param maxUrls - Maximum number of URLs to return (default: 10)
 * @returns Array of normalized, deduplicated absolute URLs
 */
/**
 * Normalize and deduplicate an array of image URLs.
 * Handles markdown format, relative URLs, protocol-relative URLs, and deduplication.
 * 
 * Steps for each URL:
 * 1. Trim whitespace
 * 2. Extract from markdown link format if present: [text](url) -> url
 * 3. Handle protocol-relative URLs: //example.com -> https://example.com
 * 4. Keep only http(s) URLs
 * 5. Deduplicate and limit
 *
 * @param urls - Array of URL strings (may include markdown format)
 * @param baseUrl - Optional base URL for relative paths
 * @param maxUrls - Maximum number of URLs to return (default: 10)
 * @returns Array of normalized, deduplicated absolute URLs
 */
export function normalizeImageUrls(
  urls: string[],
  baseUrl?: string,
  maxUrls: number = 10
): string[] {
  const normalized: string[] = [];

  for (const url of urls) {
    if (!url) continue;

    // Step 1: Trim
    let processed = url.trim();
    if (!processed) continue;

    // Step 2: Extract from markdown if needed
    processed = extractUrlFromMarkdown(processed);

    // Step 3: Handle protocol-relative URLs (//example.com -> https://example.com)
    if (processed.startsWith("//")) {
      processed = "https:" + processed;
    }

    // Step 4: Normalize URL (handles relative URLs with baseUrl, validates http(s))
    const normalizedUrl = baseUrl
      ? normalizeHttpUrlWithBase(processed, baseUrl)
      : normalizeHttpUrl(processed);

    // Step 5: Keep only valid http(s) URLs
    if (normalizedUrl && (normalizedUrl.startsWith("http://") || normalizedUrl.startsWith("https://"))) {
      normalized.push(normalizedUrl);
    }
  }

  // Deduplicate
  const deduped = dedupeUrls(normalized);

  // Limit to maxUrls
  return deduped.slice(0, maxUrls);
}

