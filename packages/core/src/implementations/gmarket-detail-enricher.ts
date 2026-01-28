import * as cheerio from "cheerio";
import { normalizeImageUrls } from "../utils/normalizeUrl";

export interface DetailEnrichmentResult {
  descriptionOriginal?: string;
  imagesFromDetail?: string[];
  notes?: string;
}

const REQUEST_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Fetch and parse Gmarket product detail page
 */
export async function enrichGmarketProductDetail(
  sourceUrl: string
): Promise<DetailEnrichmentResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract description
    let descriptionOriginal = "";

    // Try multiple selectors for product description
    const descriptionSelectors = [
      ".item_detail_view .detail_view",
      ".item_detail_view .detail_info",
      ".item_detail_view .product_detail",
      ".detail_view",
      ".detail_info",
      ".product_detail",
      "#item_detail_view",
      "[class*='detail']",
      "[class*='description']",
    ];

    for (const selector of descriptionSelectors) {
      const text = $(selector).first().text().trim();
      if (text && text.length > 50) {
        // Only use if it's substantial
        descriptionOriginal = text;
        break;
      }
    }

    // Fallback: try to find any substantial text block
    if (!descriptionOriginal || descriptionOriginal.length < 50) {
      const allText = $("body").text().trim();
      // Try to extract meaningful paragraphs
      const paragraphs = allText
        .split(/\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 50);
      if (paragraphs.length > 0) {
        descriptionOriginal = paragraphs.slice(0, 3).join("\n\n");
      }
    }

    // Extract images
    const imagesFromDetail: string[] = [];
    const seenUrls = new Set<string>();

    // Try multiple selectors for product images
    const imageSelectors = [
      ".item_detail_view img",
      ".detail_view img",
      ".product_detail img",
      ".item_images img",
      "[class*='product'] img",
      "[class*='item'] img",
    ];

    imageSelectors.forEach((selector) => {
      $(selector).each((_, element) => {
        const $img = $(element);
        // Try all possible image attributes
        const possibleAttrs = ["src", "data-src", "data-original", "data-lazy", "data-lazy-src"];
        for (const attr of possibleAttrs) {
          const src = $img.attr(attr);
          if (!src) continue;

          // Remove query params for deduplication
          const baseUrl = src.split("?")[0];

          // Filter out common non-product images
          if (
            baseUrl.includes("logo") ||
            baseUrl.includes("icon") ||
            baseUrl.includes("banner") ||
            baseUrl.includes("ad")
          ) {
            continue;
          }

          if (!seenUrls.has(baseUrl)) {
            seenUrls.add(baseUrl);
            imagesFromDetail.push(src);
            break; // Only use first valid attribute per image
          }
        }
      });
    });

    // Normalize and limit to 10 images
    const baseUrl = sourceUrl.includes("www.gmarket.co.kr")
      ? "https://www.gmarket.co.kr"
      : "https://m.gmarket.co.kr";
    const limitedImages = normalizeImageUrls(imagesFromDetail, baseUrl, 10);

    return {
      descriptionOriginal: descriptionOriginal || undefined,
      imagesFromDetail: limitedImages.length > 0 ? limitedImages : undefined,
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

