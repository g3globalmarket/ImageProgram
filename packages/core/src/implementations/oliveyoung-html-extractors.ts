import type { CheerioAPI } from "cheerio";
import { normalizeImageUrls } from "../utils/normalizeUrl";

/**
 * Extract image URLs from Open Graph and Twitter meta tags
 * @param $ - Cheerio API instance
 * @returns Array of normalized absolute image URLs
 */
export function extractOgImages($: CheerioAPI): string[] {
  const imageUrls: string[] = [];

  // Open Graph image
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) {
    imageUrls.push(ogImage);
  }

  // Twitter image
  const twitterImage = $('meta[name="twitter:image"]').attr("content");
  if (twitterImage) {
    imageUrls.push(twitterImage);
  }

  // Link rel="image_src"
  const linkImage = $('link[rel="image_src"]').attr("href");
  if (linkImage) {
    imageUrls.push(linkImage);
  }

  // Normalize and deduplicate
  return normalizeImageUrls(imageUrls, "https://www.oliveyoung.co.kr", 10);
}

/**
 * Extract image URLs from JSON-LD structured data
 * @param $ - Cheerio API instance
 * @returns Array of normalized absolute image URLs
 */
export function extractJsonLdImages($: CheerioAPI): string[] {
  const imageUrls: string[] = [];

  // Find all JSON-LD script tags
  $('script[type="application/ld+json"]').each((_, element) => {
    const text = $(element).text();
    if (!text) return;

    try {
      const data = JSON.parse(text);

      // Handle single object
      if (data.image) {
        if (typeof data.image === "string") {
          imageUrls.push(data.image);
        } else if (Array.isArray(data.image)) {
          for (const img of data.image) {
            if (typeof img === "string") {
              imageUrls.push(img);
            } else if (img && typeof img === "object" && img.url) {
              imageUrls.push(img.url);
            }
          }
        } else if (data.image && typeof data.image === "object" && data.image.url) {
          imageUrls.push(data.image.url);
        }
      }

      // Handle @graph arrays (common in structured data)
      if (Array.isArray(data["@graph"])) {
        for (const item of data["@graph"]) {
          if (item && typeof item === "object") {
            if (item.image) {
              if (typeof item.image === "string") {
                imageUrls.push(item.image);
              } else if (Array.isArray(item.image)) {
                for (const img of item.image) {
                  if (typeof img === "string") {
                    imageUrls.push(img);
                  } else if (img && typeof img === "object" && img.url) {
                    imageUrls.push(img.url);
                  }
                }
              } else if (item.image && typeof item.image === "object" && item.image.url) {
                imageUrls.push(item.image.url);
              }
            }
          }
        }
      }

      // Handle arrays of objects
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && typeof item === "object" && item.image) {
            if (typeof item.image === "string") {
              imageUrls.push(item.image);
            } else if (Array.isArray(item.image)) {
              for (const img of item.image) {
                if (typeof img === "string") {
                  imageUrls.push(img);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      // Silently ignore JSON parse errors
      // Some sites have malformed JSON-LD or non-JSON content
    }
  });

  // Normalize and deduplicate
  return normalizeImageUrls(imageUrls, "https://www.oliveyoung.co.kr", 10);
}

/**
 * Extract fallback description from meta tags and JSON-LD
 * @param $ - Cheerio API instance
 * @returns Description string (max 1000 chars) or empty string
 */
export function extractFallbackDescription($: CheerioAPI): string {
  let description = "";

  // Try Open Graph description first
  description = $('meta[property="og:description"]').attr("content") || "";

  // Fallback to standard meta description
  if (!description || description.trim().length < 10) {
    description = $('meta[name="description"]').attr("content") || "";
  }

  // Try JSON-LD description
  if (!description || description.trim().length < 10) {
    $('script[type="application/ld+json"]').each((_, element) => {
      if (description && description.trim().length >= 10) {
        return false; // Stop if we found one
      }

      const text = $(element).text();
      if (!text) return;

      try {
        const data = JSON.parse(text);

        // Check direct description
        if (data.description && typeof data.description === "string") {
          description = data.description;
          return false; // Stop after first match
        }

        // Check @graph
        if (Array.isArray(data["@graph"])) {
          for (const item of data["@graph"]) {
            if (item && typeof item === "object" && item.description && typeof item.description === "string") {
              description = item.description;
              return false;
            }
          }
        }

        // Check array format
        if (Array.isArray(data)) {
          for (const item of data) {
            if (item && typeof item === "object" && item.description && typeof item.description === "string") {
              description = item.description;
              return false;
            }
          }
        }
      } catch (error) {
        // Silently ignore JSON parse errors
      }
    });
  }

  // Trim and limit to 1000 chars
  description = description.trim();
  if (description.length > 1000) {
    description = description.substring(0, 1000);
  }

  return description;
}

