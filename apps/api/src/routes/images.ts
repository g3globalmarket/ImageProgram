/**
 * Image enrichment API routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { enrichProductImages, enrichProductImagesBatch } from "../services/imageEnrichmentService";
import { searchImages } from "../services/googleImageSearch";
import { downloadImage } from "../services/imageDownloader";
import { Product } from "../models/Product";
import { toProductDTO } from "../dto/productDto";
import { normalizeImageUrls } from "@repo/core";
import { isUrlSafe } from "../utils/ssrfProtection";
import { cleanImageSearchQuery } from "../services/titleCleanerAI";
import { unlink } from "fs/promises";
import { join } from "path";
import { config } from "../config";
import pLimit from "p-limit";

const router = Router();

/**
 * POST /api/images/enrich-one
 * Enrich images for a single product
 */
router.post("/enrich-one", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!config.imageEnrichmentEnabled) {
      return res.status(503).json({
        error: {
          message: "Image enrichment is disabled",
          hint: "Set IMAGE_ENRICHMENT_ENABLED=true to enable",
        },
      });
    }

    const { productId, desiredCount, force } = req.body;

    if (!productId) {
      return res.status(400).json({
        error: {
          message: "productId is required",
        },
      });
    }

    const result = await enrichProductImages({
      productId,
      desiredCount: desiredCount || config.imageTargetCount,
      force: force || false,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/images/enrich-batch
 * Enrich images for multiple products
 */
router.post("/enrich-batch", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!config.imageEnrichmentEnabled) {
      return res.status(503).json({
        error: {
          message: "Image enrichment is disabled",
          hint: "Set IMAGE_ENRICHMENT_ENABLED=true to enable",
        },
      });
    }

    const { store, limit, desiredCount, force } = req.body;

    const result = await enrichProductImagesBatch({
      store,
      limit: limit || 20,
      desiredCount: desiredCount || config.imageTargetCount,
      force: force || false,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/images/suggest
 * Suggest images for a product (no download)
 */
router.get("/suggest", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const productId = req.query.productId as string | undefined;
    const count = Math.min(
      Math.max(parseInt(req.query.count as string || "12", 10), 4),
      30
    );

    if (!productId) {
      return res.status(400).json({
        error: {
          message: "productId query parameter is required",
        },
      });
    }

    // Load product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        error: {
          message: "Product not found",
        },
      });
    }

    // Build optimized search query using AI title cleaning
    const cleanResult = await cleanImageSearchQuery({
      title: product.title || "",
      brand: (product as any).brand,
      store: product.store,
    });

    if (!cleanResult.query) {
      return res.status(400).json({
        error: {
          message: "No search query available (missing title)",
        },
      });
    }

    const query = cleanResult.query;

    // Fetch multiple pages to get enough candidates
    const maxCandidates = count;
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
        
        if (pageResults.length < candidatesPerPage || allCandidateUrls.length >= maxCandidates) {
          break;
        }
      } catch (error) {
        console.warn(`[Image Suggest] Failed to fetch page ${page + 1}: ${error instanceof Error ? error.message : "Unknown error"}`);
        break;
      }
    }

    // Normalize and deduplicate URLs
    const normalized = normalizeImageUrls(allCandidateUrls);
    const unique = Array.from(new Set(normalized));

    // Cap to requested count
    const suggestions = unique.slice(0, count).map((url) => ({
      url,
      source: "google_cse" as const,
    }));

    res.json({
      productId,
      query,
      queryUsed: query, // The actual query used for search
      methodUsed: cleanResult.method, // "ai" or "fallback"
      countRequested: count,
      suggestions,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/images/apply
 * Download and add selected images to product
 */
router.post("/apply", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, urls: rawUrls } = req.body;

    if (!productId) {
      return res.status(400).json({
        error: {
          message: "productId is required",
        },
      });
    }

    // Validate and normalize URLs array
    let urls: string[] = [];
    if (Array.isArray(rawUrls)) {
      // Handle both string[] and object[] formats
      urls = rawUrls
        .map((u) => (typeof u === "string" ? u : u?.url))
        .filter((u): u is string => Boolean(u) && typeof u === "string")
        .map((u) => u.trim())
        .filter((u) => u.length > 0);
    }

    console.log("[images/apply] productId", productId, "urls", urls.length, urls.slice(0, 3));

    if (urls.length === 0) {
      return res.status(400).json({
        error: {
          message: "urls must be a non-empty array of strings",
        },
      });
    }

    // Limit max URLs per request
    if (urls.length > 30) {
      return res.status(400).json({
        error: {
          message: "Maximum 30 URLs allowed per request",
        },
      });
    }

    // Load product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        error: {
          message: "Product not found",
        },
      });
    }

    // Validate URLs for SSRF protection
    const safeUrls: string[] = [];
    const unsafeUrls: string[] = [];
    
    for (const url of urls) {
      if (isUrlSafe(url)) {
        safeUrls.push(url);
      } else {
        unsafeUrls.push(url);
      }
    }

    if (safeUrls.length === 0) {
      return res.status(400).json({
        error: {
          message: "No safe URLs provided. URLs must be http(s) and not point to private IPs.",
          unsafeUrls,
        },
      });
    }

    // Get existing images to avoid duplicates
    const existingImages = [
      ...(product.imagesProcessed || []),
      ...(product.imagesOriginal || []),
    ];
    const normalizedExisting = normalizeImageUrls(existingImages);
    const existingSet = new Set(normalizedExisting);

    // Normalize and deduplicate new URLs
    const normalizedNew = normalizeImageUrls(safeUrls);
    const uniqueNewUrls = Array.from(new Set(normalizedNew));
    const newUrls = uniqueNewUrls.filter((url) => !existingSet.has(url));

    if (newUrls.length === 0) {
      return res.json({
        downloaded: 0,
        failed: 0,
        errors: ["All URLs are duplicates"],
        product: toProductDTO(product),
      });
    }

    // Download images sequentially to ensure unique file indices
    // This prevents race conditions where multiple downloads might use the same index
    const downloadedUrls: string[] = [];
    const errors: string[] = [];
    const startIndex = product.imagesProcessed?.length ?? 0;
    let downloaded = 0;

    console.log(`[images/apply] Starting download: ${newUrls.length} URLs, startIndex=${startIndex}`);

    // Download sequentially to ensure each URL gets a unique index
    for (const url of newUrls) {
      try {
        const fileIndex = startIndex + downloaded;
        console.log(`[images/apply] Downloading URL ${downloaded + 1}/${newUrls.length}: index=${fileIndex}, url=${url.substring(0, 50)}...`);
        
        const localUrl = await downloadImage({
          imageUrl: url,
          productId: productId.toString(),
          index: fileIndex,
        });
        
        downloadedUrls.push(localUrl);
        downloaded++;
        console.log(`[images/apply] Success: saved to ${localUrl}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        errors.push(errorMsg);
        console.warn(`[images/apply] Failed to download ${url}: ${errorMsg}`);
        // Continue to next URL
      }
    }

    // Update product
    const updatedImagesProcessed = [
      ...(product.imagesProcessed || []),
      ...downloadedUrls,
    ];

    product.imagesProcessed = updatedImagesProcessed;
    await product.save();

    res.json({
      downloaded: downloadedUrls.length,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      product: toProductDTO(product),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/images/delete
 * Delete an image from product and filesystem
 */
router.post("/delete", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, imageUrl } = req.body;

    if (!productId || !imageUrl) {
      return res.status(400).json({
        error: {
          message: "productId and imageUrl are required",
        },
      });
    }

    // Load product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        error: {
          message: "Product not found",
        },
      });
    }

    // Only allow deleting from imagesProcessed (local images)
    const imagesProcessed = product.imagesProcessed || [];
    if (!imagesProcessed.includes(imageUrl)) {
      return res.status(400).json({
        error: {
          message: "Image not found in imagesProcessed. Only local images can be deleted.",
        },
      });
    }

    // Remove from array
    product.imagesProcessed = imagesProcessed.filter((url) => url !== imageUrl);
    await product.save();

    // Delete file if it's a local path
    if (imageUrl.startsWith("/uploads/products/") || imageUrl.startsWith("uploads/products/")) {
      try {
        // Extract file path: /uploads/products/<productId>/<filename>
        const pathParts = imageUrl.split("/");
        const filename = pathParts[pathParts.length - 1];
        const filePath = join(
          process.cwd(),
          config.imageDownloadDir,
          productId.toString(),
          filename
        );
        await unlink(filePath).catch((err) => {
          // Ignore file not found errors
          if (err.code !== "ENOENT") {
            console.warn(`[Image Delete] Failed to delete file ${filePath}: ${err.message}`);
          }
        });
      } catch (error) {
        // Ignore file deletion errors - product is already updated
        console.warn(`[Image Delete] Error deleting file: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    res.json({
      product: toProductDTO(product),
    });
  } catch (error) {
    next(error);
  }
});

export default router;

