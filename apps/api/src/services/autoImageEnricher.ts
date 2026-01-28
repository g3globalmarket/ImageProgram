/**
 * Auto image enrichment service: automatically enriches images for products with no images
 */

import type { Document } from "mongoose";
import type { IProduct } from "../models/Product";
import { enrichProductImages } from "./imageEnrichmentService";
import { config } from "../config";
import pLimit from "p-limit";

// Support both Mongoose documents and lean documents
type ProductDoc = (Document<unknown, {}, IProduct> & IProduct & Required<{ _id: any }>) | (IProduct & { _id: any });

export interface AutoEnrichResult {
  checked: number;
  enriched: number;
  skipped: number;
  failed: number;
}

/**
 * Automatically enrich images for products that have no images
 * Filters products with zero images (imagesProcessed + imagesOriginal === 0)
 * Limits to AUTO_ENRICH_IMAGES_MAX_PER_RUN
 * Uses concurrency control (AUTO_ENRICH_IMAGES_CONCURRENCY)
 */
export async function autoEnrichImagesForProducts(
  products: ProductDoc[]
): Promise<AutoEnrichResult> {
  // Early return if disabled
  if (!config.autoEnrichImagesOnImport || !config.imageEnrichmentEnabled) {
    return {
      checked: products.length,
      enriched: 0,
      skipped: products.length,
      failed: 0,
    };
  }

  // Filter products needing images: (imagesProcessed.length + imagesOriginal.length) === 0
  const productsNeedingImages = products.filter((product) => {
    const processedCount = product.imagesProcessed?.length ?? 0;
    const originalCount = product.imagesOriginal?.length ?? 0;
    return processedCount + originalCount === 0;
  });

  // Limit to max per run
  const productsToEnrich = productsNeedingImages.slice(0, config.autoEnrichImagesMaxPerRun);

  const result: AutoEnrichResult = {
    checked: products.length,
    enriched: 0,
    skipped: products.length - productsNeedingImages.length,
    failed: 0,
  };

  if (productsToEnrich.length === 0) {
    return result;
  }

  console.log(
    `[Auto Image Enrichment] Found ${productsNeedingImages.length} products with no images, ` +
    `enriching ${productsToEnrich.length} (limited by max per run)`
  );

  // Process with concurrency limit
  const limitConcurrency = pLimit(config.autoEnrichImagesConcurrency);
  const enrichPromises = productsToEnrich.map((product) =>
    limitConcurrency(async () => {
      try {
        const enrichResult = await enrichProductImages({
          productId: product._id.toString(),
          desiredCount: config.autoEnrichImagesTarget,
          force: false,
        });

        if (enrichResult.success) {
          if (enrichResult.skipped) {
            result.skipped++;
          } else if (enrichResult.downloaded > 0) {
            result.enriched++;
          }
        } else {
          result.failed++;
          console.warn(
            `[Auto Image Enrichment] Failed for product ${product._id}: ${enrichResult.error || "Unknown error"}`
          );
        }
      } catch (error) {
        result.failed++;
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        console.warn(`[Auto Image Enrichment] Exception for product ${product._id}: ${errorMsg}`);
      }
    })
  );

  await Promise.all(enrichPromises);

  console.log(
    `[Auto Image Enrichment] Complete: checked=${result.checked}, ` +
    `enriched=${result.enriched}, skipped=${result.skipped}, failed=${result.failed}`
  );

  return result;
}

