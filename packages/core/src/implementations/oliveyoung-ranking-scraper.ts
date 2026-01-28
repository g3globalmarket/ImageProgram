import * as cheerio from "cheerio";
import type { Scraper } from "../interfaces";
import type { RawProduct, ScraperConfig } from "../types";
import { normalizeImageUrls } from "../utils/normalizeUrl";

export class OliveYoungRankingScraper implements Scraper {
  async fetchProducts(config: ScraperConfig): Promise<RawProduct[]> {
    const debug = process.env.DEBUG_SCRAPER === "1";

    if (debug) {
      console.debug(`[OliveYoungRankingScraper] Fetching from: ${config.categoryUrl}`);
    }

    try {
      // Fetch HTML with browser-like headers
      const response = await fetch(config.categoryUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
          Referer: "https://www.oliveyoung.co.kr/",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      const products: RawProduct[] = [];

      // Try multiple selectors for OliveYoung ranking page
      // Based on actual page structure: .prd_info, .prd_list li, .cate_prd_list li
      let productElements = $(".prd_info, .prd_list li, .cate_prd_list li, .ranking_item, li[data-goods-no]");

      // If no items found, try alternative selectors
      if (productElements.length === 0) {
        productElements = $("li[data-product-id], .item, [class*='prd']");
      }

      if (debug) {
        console.debug(
          `[OliveYoungRankingScraper] Found ${productElements.length} potential product elements`
        );
      }

      let count = 0;
      const seenUrls = new Set<string>();
      const seenGoodsNo = new Set<string>();

      productElements.each((_, element) => {
        if (count >= config.limit) {
          return false; // Break loop
        }

        const $el = $(element);
        let title = "";
        let price = 0;
        let sourceUrl = "";
        let goodsNo = "";

        // Try to find product link and extract goodsNo
        const link = $el.is("a") ? $el : $el.find("a[href*='getGoodsDetail'], a[href*='goodsNo']").first();
        const href = link.attr("href") || "";

        if (href) {
          // Extract goodsNo from URL
          const goodsNoMatch = href.match(/goodsNo=([A-Z0-9]+)/i);
          if (goodsNoMatch) {
            goodsNo = goodsNoMatch[1];
          }

          // Normalize URL
          if (href.startsWith("http")) {
            sourceUrl = href;
          } else if (href.startsWith("/")) {
            sourceUrl = `https://www.oliveyoung.co.kr${href}`;
          } else {
            sourceUrl = `https://www.oliveyoung.co.kr/${href}`;
          }
        } else {
          // Try data attribute
          goodsNo = $el.attr("data-goods-no") || $el.attr("data-goodsno") || "";
          if (goodsNo) {
            sourceUrl = `https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${goodsNo}`;
          }
        }

        // Skip if we've seen this goodsNo or URL
        if (goodsNo && seenGoodsNo.has(goodsNo)) {
          return;
        }
        if (sourceUrl && seenUrls.has(sourceUrl)) {
          return;
        }
        if (goodsNo) seenGoodsNo.add(goodsNo);
        if (sourceUrl) seenUrls.add(sourceUrl);

        // Try to find title - common patterns
        title =
          $el.find(".prd_name, .prd_name_link, .product-name, .item-name, .title, h3, h4, a")
            .first()
            .text()
            .trim() ||
          $el.attr("title") ||
          $el.find("a").attr("title") ||
          link.text().trim() ||
          "";

        // Try to find price - look for price elements
        const priceText =
          $el
            .find(".prd_price, .price, .price-value, .num, .sale_price, strong")
            .first()
            .text()
            .trim() || "";

        // Parse price: remove commas, ₩, spaces, extract numbers
        const priceMatch = priceText.replace(/[^\d]/g, "");
        if (priceMatch) {
          price = parseInt(priceMatch, 10) || 0;
        }

        // Try to find image - OliveYoung uses specific image domains
        // Check multiple possible attributes in order of preference
        const img = $el.find("img").first();
        const imageUrls: string[] = [];
        
        // Try all possible image attributes
        const possibleAttrs = ["src", "data-src", "data-original", "data-lazy", "data-lazy-src", "data-img"];
        for (const attr of possibleAttrs) {
          const url = img.attr(attr);
          if (url) {
            imageUrls.push(url);
          }
        }

        // Normalize all found image URLs
        const normalizedImages = normalizeImageUrls(
          imageUrls,
          "https://www.oliveyoung.co.kr",
          1 // Only need 1 thumbnail for listing
        );

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
        const allLinks = $("a[href*='/store/goods/getGoodsDetail'], a[href*='goodsNo=']");
        allLinks.each((_, element) => {
          if (products.length >= config.limit) {
            return false;
          }

          const $link = $(element);
          const href = $link.attr("href");
          if (!href) {
            return;
          }

          // Extract goodsNo
          const goodsNoMatch = href.match(/goodsNo=([A-Z0-9]+)/i);
          if (!goodsNoMatch) {
            return;
          }

          const goodsNo = goodsNoMatch[1];
          if (seenGoodsNo.has(goodsNo)) {
            return;
          }
          seenGoodsNo.add(goodsNo);

          const fullUrl = href.startsWith("http")
            ? href
            : `https://www.oliveyoung.co.kr${href.startsWith("/") ? href : `/${href}`}`;
          seenUrls.add(fullUrl);

          const linkText = $link.text().trim();
          const parentText = $link.parent().text().trim();

          // Try to find image for fallback products too
          const $linkEl = $link.closest("li, div, .item");
          const fallbackImg = $linkEl.find("img").first();
          const fallbackImageUrls: string[] = [];
          const possibleAttrs = ["src", "data-src", "data-original", "data-lazy", "data-lazy-src", "data-img"];
          for (const attr of possibleAttrs) {
            const url = fallbackImg.attr(attr);
            if (url) {
              fallbackImageUrls.push(url);
            }
          }
          const fallbackNormalizedImages = normalizeImageUrls(
            fallbackImageUrls,
            "https://www.oliveyoung.co.kr",
            1
          );

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
          `[OliveYoungRankingScraper] Extracted ${products.length} products`
        );
      }

      // Limit to requested amount
      return products.slice(0, config.limit);
    } catch (error) {
      console.error("[OliveYoungRankingScraper] Error:", error);
      throw new Error(
        `Failed to scrape OliveYoung: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

