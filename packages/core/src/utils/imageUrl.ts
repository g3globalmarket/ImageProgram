/**
 * Image URL utilities for validation and normalization
 */

import {
  extractUrlFromMarkdown,
  normalizeHttpUrl,
  dedupeUrls,
  normalizeImageUrls as normalizeImageUrlsBase,
} from "./normalizeUrl";

/**
 * Check if a URL looks like an image URL based on extension or common patterns
 */
export function looksLikeImageUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  
  const lower = url.toLowerCase();
  
  // Check for common image extensions
  const imageExtensions = [
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico",
    ".jpg?", ".jpeg?", ".png?", ".gif?", ".webp?", // With query params
  ];
  
  for (const ext of imageExtensions) {
    if (lower.includes(ext)) {
      return true;
    }
  }
  
  // Check for common image patterns in URLs
  const imagePatterns = [
    "/image/",
    "/img/",
    "/images/",
    "/photo/",
    "/photos/",
    "/picture/",
    "/pictures/",
    "image=",
    "img=",
    "photo=",
  ];
  
  for (const pattern of imagePatterns) {
    if (lower.includes(pattern)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Normalize and validate image URLs (with image URL filtering)
 * Extracts from markdown, normalizes HTTP(S), filters to image-like URLs, deduplicates
 * This is a specialized version that filters to image-like URLs only
 */
export function normalizeAndFilterImageUrls(
  urls: string[],
  baseUrl?: string,
  maxUrls: number = 10
): string[] {
  const normalized: string[] = [];

  for (const url of urls) {
    if (!url) continue;

    // Extract from markdown if needed
    let processed = extractUrlFromMarkdown(url.trim());
    if (!processed) continue;

    // Normalize HTTP(S) URL
    const normalizedUrl = baseUrl
      ? normalizeHttpUrlWithBase(processed, baseUrl)
      : normalizeHttpUrl(processed);

    // Keep only valid http(s) URLs that look like images
    if (normalizedUrl && looksLikeImageUrl(normalizedUrl)) {
      normalized.push(normalizedUrl);
    }
  }

  // Deduplicate
  const deduped = dedupeUrls(normalized);

  // Limit to maxUrls
  return deduped.slice(0, maxUrls);
}

/**
 * Normalize HTTP URL with base (re-export for convenience)
 */
function normalizeHttpUrlWithBase(input?: string | null, baseUrl?: string): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;

  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;

  if (s.startsWith("/") && baseUrl) {
    const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    return base + s;
  }

  if (baseUrl) {
    const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
    return base + s;
  }

  return null;
}

