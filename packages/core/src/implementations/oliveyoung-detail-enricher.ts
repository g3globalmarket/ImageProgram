import * as cheerio from "cheerio";
import { extractOgImages, extractJsonLdImages, extractFallbackDescription } from "./oliveyoung-html-extractors";
import { normalizeImageUrls } from "../utils/normalizeUrl";

export interface OliveYoungDetailEnrichmentResult {
  imagesFromDetail?: string[];
  descriptionOriginal?: string;
  notes?: string;
}

const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Fetch and parse OliveYoung product detail page
 * Uses og:image, JSON-LD, and meta tags as fallbacks for dynamic content
 */
export async function enrichOliveYoungProductDetail(
  sourceUrl: string
): Promise<OliveYoungDetailEnrichmentResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: "https://www.oliveyoung.co.kr/",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract images using fallback methods
    const ogImages = extractOgImages($);
    const jsonLdImages = extractJsonLdImages($);
    
    // Combine and deduplicate
    const allImages = [...ogImages, ...jsonLdImages];
    const normalizedImages = normalizeImageUrls(allImages, "https://www.oliveyoung.co.kr", 10);

    // Extract description using fallback
    const descriptionOriginal = extractFallbackDescription($);

    return {
      imagesFromDetail: normalizedImages.length > 0 ? normalizedImages : undefined,
      descriptionOriginal: descriptionOriginal || undefined,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      notes: `detail_error: ${errorMessage}`,
    };
  }
}

