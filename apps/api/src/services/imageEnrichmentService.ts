/**
 * Image enrichment service: finds and downloads images for products
 */

import { Product } from "../models/Product";
import { searchImages } from "./googleImageSearch";
import { downloadImage } from "./imageDownloader";
import { normalizeImageUrls } from "@repo/core";
import { config } from "../config";
import { cleanImageSearchQuery } from "./titleCleanerAI";
import pLimit from "p-limit";

/**
 * Enrich images for a single product
 */
export async function enrichProductImages(params: {
  productId: string;
  desiredCount?: number;
  force?: boolean;
}): Promise<{
  success: boolean;
  downloaded: number;
  finalCount: number;
  skipped: boolean;
  error?: string;
}> {
  const { productId, desiredCount = config.imageTargetCount, force = false } = params;

  try {
    // Load product
    const product = await Product.findById(productId);
    if (!product) {
      return {
        success: false,
        downloaded: 0,
        finalCount: 0,
        skipped: false,
        error: "Product not found",
      };
    }

    // Get existing images (normalized and deduplicated)
    const existingImages = [
      ...(product.imagesProcessed || []),
      ...(product.imagesOriginal || []),
    ];
    const normalizedExisting = normalizeImageUrls(existingImages);
    const existingSet = new Set(normalizedExisting);
    const totalExistingCount = normalizedExisting.length;

    // Check if we need to enrich
    if (!force && totalExistingCount >= desiredCount) {
      return {
        success: true,
        downloaded: 0,
        finalCount: totalExistingCount,
        skipped: true,
      };
    }

    // Build optimized search query using AI title cleaning
    const cleanResult = await cleanImageSearchQuery({
      title: product.title || "",
      brand: (product as any).brand,
      store: product.store,
    });

    if (!cleanResult.query) {
      return {
        success: false,
        downloaded: 0,
        finalCount: totalExistingCount,
        skipped: false,
        error: "No search query available (missing title)",
      };
    }

    const query = cleanResult.query;

    // Fetch multiple pages of search results to get enough candidates
    const maxCandidates = 30; // Try to get up to 30 candidates
    const candidatesPerPage = 10;
    const maxPages = Math.ceil(maxCandidates / candidatesPerPage);
    
    let allCandidateUrls: string[] = [];
    for (let page = 0; page < maxPages; page++) {
      const start = page * candidatesPerPage + 1;
      try {
        const pageResults = await searchImages({
          query,
          num: candidatesPerPage,
          start,
          rights: config.imageRights || undefined,
        });
        allCandidateUrls.push(...pageResults);
        
        // If we got fewer results than requested, we've reached the end
        if (pageResults.length < candidatesPerPage) {
          break;
        }
      } catch (error) {
        console.warn(`[Image Search] Failed to fetch page ${page + 1}: ${error instanceof Error ? error.message : "Unknown error"}`);
        // Continue with what we have
        break;
      }
    }

    // Filter out duplicates (by URL)
    const uniqueCandidates = Array.from(new Set(allCandidateUrls));
    
    // Filter out URLs that already exist
    const newUrls = uniqueCandidates.filter((url) => {
      // Accept any http(s) URL from Google Custom Search - don't pre-filter
      if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
        return false;
      }
      if (existingSet.has(url)) {
        return false;
      }
      return true;
    });

    // Calculate how many we need to download
    // We want desiredCount total images (imagesProcessed + imagesOriginal combined)
    // But we only add to imagesProcessed, so we need to ensure imagesProcessed has enough
    // to reach desiredCount when combined with imagesOriginal
    const currentProcessedCount = (product.imagesProcessed || []).length;
    const currentOriginalCount = (product.imagesOriginal || []).length;
    
    // Calculate how many more imagesProcessed we need
    // If we have 2 original + 1 processed = 3 total, and desiredCount=5, we need 2 more processed
    // But we need to account for potential duplicates between processed and original
    // So: needed = max(0, desiredCount - totalExistingCount)
    const needed = Math.max(0, desiredCount - totalExistingCount);

    console.log(
      `[Image Enrichment] Product ${productId}: ` +
      `candidatesFetched=${allCandidateUrls.length}, ` +
      `uniqueCandidates=${uniqueCandidates.length}, ` +
      `newUrls=${newUrls.length}, ` +
      `existingImages=${totalExistingCount} (processed=${currentProcessedCount}, original=${currentOriginalCount}), ` +
      `desiredCount=${desiredCount}, ` +
      `needed=${needed}`
    );

    if (needed === 0) {
      return {
        success: true,
        downloaded: 0,
        finalCount: totalExistingCount,
        skipped: false,
      };
    }

    // Download images sequentially until we reach desiredCount
    // This ensures we continue even if some downloads fail
    const downloadedUrls: string[] = [];
    const errors: string[] = [];
    let attemptIndex = 0;

    for (const url of newUrls) {
      // Stop if we've reached desiredCount
      if (downloadedUrls.length >= needed) {
        break;
      }

      try {
        // Start index from existing imagesProcessed length
        const fileIndex = currentProcessedCount + downloadedUrls.length;
        const localUrl = await downloadImage({
          imageUrl: url,
          productId: productId.toString(),
          index: fileIndex,
        });
        downloadedUrls.push(localUrl);
        console.log(
          `[Image Download] Success for product ${productId}: ${localUrl} (${downloadedUrls.length}/${needed})`
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        errors.push(errorMsg);
        console.warn(`[Image Download] Failed for ${url}: ${errorMsg}`);
        // Continue to next candidate
      }
      
      attemptIndex++;
    }

    console.log(
      `[Image Enrichment] Product ${productId} complete: ` +
      `attempted=${attemptIndex}, ` +
      `downloaded=${downloadedUrls.length}, ` +
      `errors=${errors.length}`
    );

    // Update product with new images
    const updatedImagesProcessed = [
      ...(product.imagesProcessed || []),
      ...downloadedUrls,
    ];

    // Update notes with accurate count
    const existingNotes = product.notes || "";
    const notesUpdate = downloadedUrls.length > 0
      ? existingNotes
        ? `${existingNotes}; images_enriched_local(${downloadedUrls.length})`
        : `images_enriched_local(${downloadedUrls.length})`
      : existingNotes;
    
    console.log(
      `[Image Enrichment] Product ${productId} final: ` +
      `finalImagesProcessedCount=${updatedImagesProcessed.length}, ` +
      `downloadedInThisRun=${downloadedUrls.length}`
    );

    product.imagesProcessed = updatedImagesProcessed;
    product.notes = notesUpdate;
    await product.save();

    return {
      success: true,
      downloaded: downloadedUrls.length,
      finalCount: updatedImagesProcessed.length,
      skipped: false,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      downloaded: 0,
      finalCount: 0,
      skipped: false,
      error: errorMsg,
    };
  }
}

/**
 * Enrich images for multiple products (batch)
 */
export async function enrichProductImagesBatch(params: {
  store?: string;
  limit?: number;
  desiredCount?: number;
  force?: boolean;
}): Promise<{
  matched: number;
  enriched: number;
  skipped: number;
  failed: number;
  errors: string[];
}> {
  const {
    store,
    limit = 20,
    desiredCount = config.imageTargetCount,
    force = false,
  } = params;

  try {
    // Find products that need enrichment
    const query: any = {};
    if (store) {
      query.store = store;
    }

    if (!force) {
      // Find products with fewer than desiredCount images
      query.$expr = {
        $lt: [
          {
            $add: [
              { $size: { $ifNull: ["$imagesProcessed", []] } },
              { $size: { $ifNull: ["$imagesOriginal", []] } },
            ],
          },
          desiredCount,
        ],
      };
    }

    const products = await Product.find(query).limit(limit).select("_id");

    const results = {
      matched: products.length,
      enriched: 0,
      skipped: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Process with concurrency limit
    const limitConcurrency = pLimit(config.imageConcurrency);
    const enrichPromises = products.map((product) =>
      limitConcurrency(async () => {
        const result = await enrichProductImages({
          productId: product._id.toString(),
          desiredCount,
          force,
        });

        if (result.success) {
          if (result.skipped) {
            results.skipped++;
          } else if (result.downloaded > 0) {
            results.enriched++;
          }
        } else {
          results.failed++;
          if (result.error) {
            results.errors.push(result.error);
          }
        }
      })
    );

    await Promise.all(enrichPromises);

    return results;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    return {
      matched: 0,
      enriched: 0,
      skipped: 0,
      failed: 0,
      errors: [errorMsg],
    };
  }
}

