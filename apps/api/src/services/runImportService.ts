import { Product } from "../models/Product";
import { ImportRun } from "../models/ImportRun";
import { StagedProduct } from "../models/StagedProduct";
import { STORE_CATALOG, LOCKABLE_PRODUCT_FIELDS } from "@repo/shared";
import type { ImportRunRequest } from "@repo/shared";
import type { LockableProductField } from "@repo/shared";
import {
  runImportPipeline,
  buildTranslator,
  buildImageProvider,
  StubScraper,
  GmarketBestScraper,
  OliveYoungRankingScraper,
  isScraperSupported,
  getDemoProductsForRequest,
  type DemoProduct,
  type ProcessedProduct,
} from "@repo/core";
import { MongoTranslationCache } from "../cache/translationCache";
import { MongoImageCache } from "../cache/imageCache";
import { translateTitleToMn } from "../services/titleMnTranslatorAI";
import { autoEnrichImagesForProducts } from "../services/autoImageEnricher";
import { createLimiter } from "../utils/limitConcurrency";
import type { AppConfig } from "../config";

export interface RunImportServiceResult {
  runId: string;
  stats: {
    matched: number;
    inserted: number;
    updated: number;
    durationMs: number;
    upsertedIds: string[];
  };
  staged?: {
    stagedCount: number;
    importRunId: string;
  };
  demo?: {
    usedStoreFilter: boolean;
    requestedCategoryKey: string;
    usedFallbackStoreOnly: boolean;
    matchedInJson: number;
    availableCategoryKeys?: string[];
  };
}

export async function runImportService(args: {
  request: ImportRunRequest;
  envConfig: AppConfig;
}): Promise<RunImportServiceResult> {
  const { request: params, envConfig: config } = args;

  // Validate store exists in catalog
  const storeCatalog = STORE_CATALOG[params.store as keyof typeof STORE_CATALOG];
  if (!storeCatalog) {
    throw new Error(`Store '${params.store}' not found in catalog`);
  }

  // Validate category exists in store
  const category = storeCatalog.categories.find(
    (cat: { key: string; label: string; url: string }) => cat.key === params.categoryKey
  );
  if (!category) {
    throw new Error(
      `Category '${params.categoryKey}' not found for store '${params.store}'`
    );
  }

  // Create import run record (needed for both demo and real mode)
  const startedAt = new Date();
  const importRun = new ImportRun({
    store: params.store,
    categoryKey: params.categoryKey,
    categoryUrl: category.url,
    limit: params.limit,
    translateTo: params.translateTo,
    imageMode: params.imageMode,
    translationProvider: config.translationProvider,
    imageProvider: config.imageProvider,
    startedAt,
    matched: 0,
    inserted: 0,
    updated: 0,
    errorsCount: 0,
    includeDetails: params.includeDetails ?? false,
    detailErrorsCount: 0,
  });
  await importRun.save();

  try {
    // LOCAL/DEMO MODE: Load from local JSON instead of scraping
    let demoMetadata: {
      usedStoreFilter: boolean;
      requestedCategoryKey: string;
      usedFallbackStoreOnly: boolean;
      matchedInJson: number;
      availableCategoryKeys?: string[];
    } | undefined;

    if (config.importMode === "local" || config.importMode === "demo") {
      console.log(`[Local Import Mode] Loading products from ${config.localProductsJsonPath}`);
      
      const demoResult = await getDemoProductsForRequest({
        store: params.store,
        categoryKey: params.categoryKey,
        limit: params.limit,
        filePath: config.localProductsJsonPath,
        delayMs: config.demoDelayMs,
      });

      const { products: demoProducts, metadata } = demoResult;
      demoMetadata = metadata;

      if (demoProducts.length === 0) {
        throw new Error(
          `No demo products found for store=${params.store}, categoryKey=${params.categoryKey}`
        );
      }

      console.log(
        `[Local Import] Loaded ${demoProducts.length} products from JSON ` +
        `(fallback=${metadata.usedFallbackStoreOnly ? "yes" : "no"}, ` +
        `store=${params.store}, categoryKey=${params.categoryKey})`
      );

      // Convert demo products to ProcessedProduct format
      const processedProducts: ProcessedProduct[] = demoProducts.map((demo: DemoProduct) => ({
      store: demo.store as any,
      categoryKey: demo.categoryKey,
      sourceUrl: demo.sourceUrl,
      title: demo.title,
      price: demo.price ?? 0,
      currency: demo.currency || "KRW",
      imagesOriginal: demo.imagesOriginal || [],
      descriptionOriginal: demo.descriptionOriginal || "",
      langOriginal: demo.langOriginal || "ko",
      descriptionTranslated: demo.descriptionTranslated || "",
      langTranslated: demo.langTranslated || "mn",
      imagesProcessed: demo.imagesProcessed || [],
      status: (demo.status as any) || "imported",
      notes: demo.notes,
    }));

    // Skip to bulk write (no translation/image processing in demo mode)
    // Preload existing products to check locked fields
    const sourceUrls = processedProducts.map((p) => p.sourceUrl);
    const existingProducts = await Product.find({
      store: params.store,
      sourceUrl: { $in: sourceUrls },
    })
      .select("sourceUrl lockedFields titleMn")
      .lean()
      .exec();

    // Build map of sourceUrl -> lockedFields
    const lockedFieldsMap = new Map<string, Set<LockableProductField>>();
    existingProducts.forEach((prod) => {
      const locked = (prod.lockedFields || []) as LockableProductField[];
      lockedFieldsMap.set(prod.sourceUrl, new Set(locked));
    });

    // Auto-translate titleMn for products missing it (if enabled)
    if (config.autoTranslateTitleMn) {
      const productsNeedingTranslation = processedProducts.filter((p) => {
        const existing = existingProducts.find((ep) => ep.sourceUrl === p.sourceUrl);
        return !existing?.titleMn || (existing.titleMn as string).trim() === "";
      });

      if (productsNeedingTranslation.length > 0) {
        console.log(`[Import] Auto-translating titleMn for ${productsNeedingTranslation.length} products...`);
        // Use concurrency limiter (already applied in translateTitleToMn, but ensure batch respects it)
        const limit = createLimiter(config.aiTranslatorConcurrency);
        const translatePromises = productsNeedingTranslation.map((p) =>
          limit(async () => {
            try {
              const result = await translateTitleToMn({
                titleKo: p.title,
                store: p.store,
              });
              // Store translated titleMn in the processed product
              (p as any).titleMn = result.titleMn;
            } catch (err) {
              console.warn(`[Import] Failed to translate titleMn for ${p.sourceUrl}: ${err}`);
              // Continue without translation
            }
          })
        );

        await Promise.all(translatePromises);
      }
    }

    // Build bulkWrite operations respecting locked fields
    const bulkOps = processedProducts.map((p) => {
      const lockedFields =
        lockedFieldsMap.get(p.sourceUrl) || new Set<LockableProductField>();

      // Build $set object, excluding locked fields
      const toSet: Record<string, unknown> = {
        // Always set these (not lockable)
        store: p.store,
        categoryKey: p.categoryKey,
        sourceUrl: p.sourceUrl,
        currency: p.currency,
        imagesOriginal: p.imagesOriginal,
        descriptionOriginal: p.descriptionOriginal,
        langOriginal: p.langOriginal,
        langTranslated: p.langTranslated,
      };

      // Set titleMn if available (not lockable, always set if present)
      if ((p as any).titleMn) {
        toSet.titleMn = (p as any).titleMn;
      }

      // Only set lockable fields if not locked
      if (!lockedFields.has("title")) {
        toSet.title = p.title;
      }
      if (!lockedFields.has("price")) {
        toSet.price = p.price;
      }
      if (!lockedFields.has("imagesProcessed")) {
        toSet.imagesProcessed = p.imagesProcessed;
      }
      if (!lockedFields.has("descriptionTranslated")) {
        toSet.descriptionTranslated = p.descriptionTranslated;
      }
      if (!lockedFields.has("status")) {
        toSet.status = p.status;
      }
      if (!lockedFields.has("notes")) {
        toSet.notes = p.notes;
      }

      return {
        updateOne: {
          filter: {
            store: p.store,
            sourceUrl: p.sourceUrl,
          },
          update: {
            $set: toSet,
            $setOnInsert: {
              lockedFields: [],
            },
          },
          upsert: true,
        },
      };
    });

    const bulkResult = await Product.bulkWrite(bulkOps, {
      ordered: false, // Continue on errors
    });

    // Calculate stats
    const matched = bulkResult.matchedCount || 0;
    const inserted = bulkResult.upsertedCount || 0;
    const updated = bulkResult.modifiedCount || 0;
    const upsertedIds = Object.values(bulkResult.upsertedIds || {}).map((id) =>
      id.toString()
    );

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    // Update import run with stats
    importRun.finishedAt = finishedAt;
    importRun.durationMs = durationMs;
    importRun.matched = matched;
    importRun.inserted = inserted;
    importRun.updated = updated;
    importRun.errorsCount = 0; // No errors in demo mode
    importRun.detailErrorsCount = 0;
    await importRun.save();

    return {
      runId: importRun._id.toString(),
      stats: {
        matched,
        inserted,
        updated,
        durationMs,
        upsertedIds,
      },
    };
  }

    // REAL MODE: Use web scraping
    // Check if scraper is supported
    if (!isScraperSupported(params.store)) {
      throw new Error(
        "Scraper for this store is not implemented yet. Import disabled to avoid fake data."
      );
    }

    // Initialize scraper based on store
    let scraper;
    if (params.store === "gmarket") {
      scraper = new GmarketBestScraper();
    } else if (params.store === "oliveyoung") {
      scraper = new OliveYoungRankingScraper();
    } else {
      // Fallback to stub (should not reach here due to check above)
      scraper = new StubScraper();
    }

    // Build providers based on config (with fallback to stubs if keys missing)
    const providersConfig = {
      translationProvider: config.translationProvider,
      imageProvider: config.imageProvider,
      googleApiKey: config.googleCloudApiKey || undefined,
      customSearchEngineId: config.customSearchEngineId || undefined,
      debugGoogle: config.debugGoogle,
    };

    // Log warnings if provider is set but keys are missing
    if (
      providersConfig.translationProvider === "google_api_key" &&
      !providersConfig.googleApiKey
    ) {
      console.warn(
        "[Import] TRANSLATION_PROVIDER=google_api_key but GOOGLE_CLOUD_API_KEY is missing. Falling back to stub."
      );
    }

    if (
      providersConfig.imageProvider === "custom_search" &&
      (!providersConfig.googleApiKey || !providersConfig.customSearchEngineId)
    ) {
      console.warn(
        "[Import] IMAGE_PROVIDER=custom_search but API key or CX is missing. Falling back to stub."
      );
    }

    const translator = buildTranslator(providersConfig);
    const imageProvider = buildImageProvider(providersConfig);

    // Initialize caches if enabled
    let translationCache: MongoTranslationCache | undefined;
    let imageCache: MongoImageCache | undefined;
    if (config.cacheEnabled) {
      translationCache = new MongoTranslationCache(
        config.cacheTtlDays,
        config.debugCache
      );
      imageCache = new MongoImageCache(config.cacheTtlDays, config.debugCache);
    }
    // Run the import pipeline with categoryUrl and includeDetails
    const detailConcurrency = parseInt(process.env.DETAIL_CONCURRENCY || "3", 10);
    const processedProducts = await runImportPipeline(
      {
        ...params,
        categoryUrl: category.url,
        includeDetails: params.includeDetails ?? false,
        detailConcurrency,
      },
      {
        scraper,
        translator,
        imageProvider,
        translationCache,
        imageCache,
        cacheEnabled: config.cacheEnabled,
        debugCache: config.debugCache,
        imageSearchCx: config.customSearchEngineId,
      }
    );

    // Log cache stats if debug enabled
    if (config.debugCache && translationCache && imageCache) {
      const transStats = translationCache.getStats();
      const imageStats = imageCache.getStats();
      console.log(
        `[Cache Stats] Translation: ${transStats.hits} hits, ${transStats.misses} misses`
      );
      console.log(
        `[Cache Stats] Image: ${imageStats.hits} hits, ${imageStats.misses} misses`
      );
    }

    // Count products with errors
    const errorsCount = processedProducts.filter(
      (p) =>
        p.notes &&
        (p.notes.includes("translation_error") ||
          p.notes.includes("image_error"))
    ).length;

    // Count products with detail errors
    const detailErrorsCount = processedProducts.filter(
      (p) => p.notes && p.notes.includes("detail_error:")
    ).length;

    // Preload existing products to check locked fields
    const sourceUrls = processedProducts.map((p) => p.sourceUrl);
    const existingProducts = await Product.find({
      store: params.store,
      sourceUrl: { $in: sourceUrls },
    })
      .select("sourceUrl lockedFields titleMn")
      .lean()
      .exec();

    // Build map of sourceUrl -> lockedFields
    const lockedFieldsMap = new Map<string, Set<LockableProductField>>();
    existingProducts.forEach((prod) => {
      const locked = (prod.lockedFields || []) as LockableProductField[];
      lockedFieldsMap.set(prod.sourceUrl, new Set(locked));
    });

    // Auto-translate titleMn for products missing it (if enabled)
    if (config.autoTranslateTitleMn) {
      const productsNeedingTranslation = processedProducts.filter((p) => {
        const existing = existingProducts.find((ep) => ep.sourceUrl === p.sourceUrl);
        return !existing?.titleMn || (existing.titleMn as string).trim() === "";
      });

      if (productsNeedingTranslation.length > 0) {
        console.log(`[Import] Auto-translating titleMn for ${productsNeedingTranslation.length} products...`);
        // Use concurrency limiter (already applied in translateTitleToMn, but ensure batch respects it)
        const limit = createLimiter(config.aiTranslatorConcurrency);
        const translatePromises = productsNeedingTranslation.map((p) =>
          limit(async () => {
            try {
              const result = await translateTitleToMn({
                titleKo: p.title,
                store: p.store,
              });
              // Store translated titleMn in the processed product
              (p as any).titleMn = result.titleMn;
            } catch (err) {
              console.warn(`[Import] Failed to translate titleMn for ${p.sourceUrl}: ${err}`);
              // Continue without translation
            }
          })
        );

        await Promise.all(translatePromises);
      }
    }

    // Build bulkWrite operations respecting locked fields
    const bulkOps = processedProducts.map((p) => {
      const lockedFields =
        lockedFieldsMap.get(p.sourceUrl) || new Set<LockableProductField>();

      // Build $set object, excluding locked fields
      const toSet: Record<string, unknown> = {
        // Always set these (not lockable)
        store: p.store,
        categoryKey: p.categoryKey,
        sourceUrl: p.sourceUrl,
        currency: p.currency,
        imagesOriginal: p.imagesOriginal,
        descriptionOriginal: p.descriptionOriginal,
        langOriginal: p.langOriginal,
        langTranslated: p.langTranslated,
      };

      // Set titleMn if available (not lockable, always set if present)
      if ((p as any).titleMn) {
        toSet.titleMn = (p as any).titleMn;
      }

      // Only set lockable fields if not locked
      if (!lockedFields.has("title")) {
        toSet.title = p.title;
      }
      if (!lockedFields.has("price")) {
        toSet.price = p.price;
      }
      if (!lockedFields.has("imagesProcessed")) {
        toSet.imagesProcessed = p.imagesProcessed;
      }
      if (!lockedFields.has("descriptionTranslated")) {
        toSet.descriptionTranslated = p.descriptionTranslated;
      }
      if (!lockedFields.has("status")) {
        toSet.status = p.status;
      }
      if (!lockedFields.has("notes")) {
        toSet.notes = p.notes;
      }

      return {
        updateOne: {
          filter: {
            store: p.store,
            sourceUrl: p.sourceUrl,
          },
          update: {
            $set: toSet,
            $setOnInsert: {
              lockedFields: [],
            },
          },
          upsert: true,
        },
      };
    });

    const bulkResult = await Product.bulkWrite(bulkOps, {
      ordered: false, // Continue on errors
    });

    // Calculate stats
    const matched = bulkResult.matchedCount || 0;
    const inserted = bulkResult.upsertedCount || 0;
    const updated = bulkResult.modifiedCount || 0;
    const upsertedIds = Object.values(bulkResult.upsertedIds || {}).map((id) =>
      id.toString()
    );

    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    // Auto-enrich images for products with no images (if enabled)
    if (upsertedIds.length > 0) {
      try {
        // Fetch affected products (inserted and updated)
        const affectedProducts = await Product.find({
          _id: { $in: upsertedIds },
        }).lean();

        if (affectedProducts.length > 0) {
          const enrichResult = await autoEnrichImagesForProducts(affectedProducts as any);
          console.log(
            `[Import] Auto image enrichment: checked=${enrichResult.checked}, ` +
            `enriched=${enrichResult.enriched}, skipped=${enrichResult.skipped}, failed=${enrichResult.failed}`
          );
        }
      } catch (error) {
        console.warn(`[Import] Auto image enrichment failed: ${error instanceof Error ? error.message : String(error)}`);
        // Don't fail the import if enrichment fails
      }
    }

    // Update import run with stats
    importRun.finishedAt = finishedAt;
    importRun.durationMs = durationMs;
    importRun.matched = matched;
    importRun.inserted = inserted;
    importRun.updated = updated;
    importRun.errorsCount = errorsCount;
    importRun.detailErrorsCount = detailErrorsCount;
    await importRun.save();

    const result: RunImportServiceResult = {
      runId: importRun._id.toString(),
      stats: {
        matched,
        inserted,
        updated,
        durationMs,
        upsertedIds,
      },
    };

    // Add demo metadata if in demo mode
    if (demoMetadata) {
      result.demo = demoMetadata;
    }

    return result;
  } catch (error) {
    // Update import run with error
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    importRun.finishedAt = finishedAt;
    importRun.durationMs = durationMs;
    await importRun.save();

    throw error;
  }
}

