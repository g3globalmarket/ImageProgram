import * as cheerio from "cheerio";
import type { Scraper } from "../interfaces";
import type { RawProduct, ScraperConfig } from "../types";
import { normalizeImageUrls } from "../utils/normalizeUrl";

// Helper to sleep with random jitter
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetch HTML with browser-like headers and retry logic
async function fetchHtml(url: string, retryCount = 0): Promise<string> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    Referer: "https://www.gmarket.co.kr/",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };

  const response = await fetch(url, {
    redirect: "follow",
    headers,
  });

  // Handle 403/429 with retry
  if ((response.status === 403 || response.status === 429) && retryCount < 1) {
    const debug = process.env.DEBUG_SCRAPER === "1";
    if (debug) {
      console.log(`[Gmarket] HTTP ${response.status} on ${url}, retrying...`);
    }
    // Wait 800-1200ms with random jitter
    await sleep(800 + Math.random() * 400);
    return fetchHtml(url, retryCount + 1);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.text();
}

export class GmarketBestScraper implements Scraper {
  async fetchProducts(config: ScraperConfig): Promise<RawProduct[]> {
    const debug = process.env.DEBUG_SCRAPER === "1";
    let url = config.categoryUrl;
    let html = "";
    let triedDesktop = false;

    // Try mobile URL first
    try {
      html = await fetchHtml(url);
    } catch (error) {
      // If 403 on mobile, try desktop fallback
      if (
        error instanceof Error &&
        (error.message.includes("403") || error.message.includes("Forbidden"))
      ) {
        if (url.includes("m.gmarket.co.kr")) {
          url = url.replace("https://m.gmarket.co.kr", "https://www.gmarket.co.kr");
          triedDesktop = true;
          if (debug) {
            console.log(`[Gmarket] Trying desktop fallback: ${url}`);
          }
          try {
            html = await fetchHtml(url);
          } catch (desktopError) {
            throw new Error(
              `Failed to scrape Gmarket: HTTP 403 (blocked). Try again later or adjust headers.`
            );
          }
        } else {
          throw new Error(
            `Failed to scrape Gmarket: HTTP 403 (blocked). Try again later or adjust headers.`
          );
        }
      } else {
        throw error;
      }
    }

    if (debug) {
      console.debug(`[GmarketBestScraper] Fetching from: ${url}`);
    }

    try {
      // Parse HTML (already fetched above with retry/fallback)
      const $ = cheerio.load(html);

      const products: RawProduct[] = [];

      // Try multiple selectors for Gmarket BEST page
      // Mobile BEST page typically has items in lists or cards
      let productElements = $(".box__item-container, .box__component, .list-item, .item");

      // If no items found, try alternative selectors
      if (productElements.length === 0) {
        productElements = $("a[href*='/n/detail']");
      }

      // Fallback: find any links that look like product links
      if (productElements.length === 0) {
        productElements = $("a[href*='item']");
      }

      if (debug) {
        console.debug(
          `[GmarketBestScraper] Found ${productElements.length} potential product elements`
        );
      }

      let count = 0;
      const seenUrls = new Set<string>();

      productElements.each((_, element) => {
        if (count >= config.limit) {
          return false; // Break loop
        }

        const $el = $(element);
        let title = "";
        let price = 0;
        let sourceUrl = "";
        let imageUrl = "";

        // Try to find title - common patterns
        title =
          $el.find(".link__item, .text__item, .item-title, .title, h3, h4")
            .first()
            .text()
            .trim() ||
          $el.attr("title") ||
          $el.text().trim().split("\n")[0] ||
          "";

        // Try to find price
        const priceText =
          $el
            .find(".price, .text__value, .num, .price-value")
            .first()
            .text()
            .trim() ||
          $el.find("strong").text().trim() ||
          "";

        // Parse price: remove commas, ₩, spaces, extract numbers
        const priceMatch = priceText.replace(/[^\d]/g, "");
        if (priceMatch) {
          price = parseInt(priceMatch, 10) || 0;
        }

        // Try to find product URL
        const link = $el.is("a") ? $el : $el.find("a").first();
        const href = link.attr("href") || "";
        if (href) {
          sourceUrl = href.startsWith("http")
            ? href
            : `https://m.gmarket.co.kr${href}`;
        } else {
          // Fallback: use category URL with index
          sourceUrl = `${config.categoryUrl}&itemNo=${count + 1}`;
        }

        // Skip if we've seen this URL
        if (seenUrls.has(sourceUrl)) {
          return;
        }
        seenUrls.add(sourceUrl);

        // Try to find image - check multiple attributes
        const img = $el.find("img").first();
        const imageUrls: string[] = [];
        
        // Try all possible image attributes
        const possibleAttrs = ["src", "data-src", "data-original", "data-lazy", "data-lazy-src"];
        for (const attr of possibleAttrs) {
          const url = img.attr(attr);
          if (url) {
            imageUrls.push(url);
          }
        }

        // Normalize image URLs (use mobile base URL for Gmarket)
        const baseUrl = triedDesktop ? "https://www.gmarket.co.kr" : "https://m.gmarket.co.kr";
        const normalizedImages = normalizeImageUrls(imageUrls, baseUrl, 1);

        // Only add if we have at least a title or URL
        if (title || sourceUrl) {
          products.push({
            store: config.store,
            categoryKey: config.categoryKey,
            sourceUrl: sourceUrl || config.categoryUrl,
            title: title || "제품명 없음",
            price: price,
            currency: "KRW",
            imagesOriginal: normalizedImages,
            descriptionOriginal: "",
            langOriginal: "ko",
          });

          count++;
        }
      });

      // If we still don't have enough products, try a more aggressive approach
      if (products.length < config.limit) {
        const allLinks = $("a[href*='item'], a[href*='detail']");
        allLinks.each((_, element) => {
          if (products.length >= config.limit) {
            return false;
          }

          const $link = $(element);
          const href = $link.attr("href");
          if (!href || seenUrls.has(href)) {
            return;
          }

          const fullUrl = href.startsWith("http")
            ? href
            : triedDesktop
            ? `https://www.gmarket.co.kr${href}`
            : `https://m.gmarket.co.kr${href}`;
          seenUrls.add(fullUrl);

          const linkText = $link.text().trim();
          const parentText = $link.parent().text().trim();

          // Try to find image for fallback products too
          const $linkEl = $link.closest("li, div, .item");
          const fallbackImg = $linkEl.find("img").first();
          const fallbackImageUrls: string[] = [];
          const possibleAttrs = ["src", "data-src", "data-original", "data-lazy", "data-lazy-src"];
          for (const attr of possibleAttrs) {
            const url = fallbackImg.attr(attr);
            if (url) {
              fallbackImageUrls.push(url);
            }
          }
          const fallbackBaseUrl = triedDesktop ? "https://www.gmarket.co.kr" : "https://m.gmarket.co.kr";
          const fallbackNormalizedImages = normalizeImageUrls(fallbackImageUrls, fallbackBaseUrl, 1);

          products.push({
            store: config.store,
            categoryKey: config.categoryKey,
            sourceUrl: fullUrl,
            title: linkText || parentText || "제품명 없음",
            price: 0,
            currency: "KRW",
            imagesOriginal: fallbackNormalizedImages,
            descriptionOriginal: "",
            langOriginal: "ko",
          });
        });
      }

      if (debug) {
        console.debug(
          `[GmarketBestScraper] Extracted ${products.length} products`
        );
      }

      // Limit to requested amount
      return products.slice(0, config.limit);
    } catch (error) {
      console.error("[GmarketBestScraper] Error:", error);
      throw new Error(
        `Failed to scrape Gmarket: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

