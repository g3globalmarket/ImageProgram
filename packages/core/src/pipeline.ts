import type {
  Scraper,
  Translator,
  ImageProvider,
} from "./interfaces";
import type {
  ProcessedProduct,
  RawProduct,
  PipelineProvidersConfig,
} from "./types";
import type { ImportRunRequest } from "@repo/shared";
import { StubTranslator } from "./implementations/stub-translator";
import { StubImageProvider } from "./implementations/stub-image-provider";
import { GoogleTranslateApiKeyTranslator } from "./implementations/google-translate-api-key-translator";
import { GoogleCustomSearchImageProvider } from "./implementations/google-custom-search-image-provider";
import { generateStableSourceUrl } from "./utils/hash";
import { mapWithConcurrency, sleep } from "./utils/pool";
import { enrichGmarketProductDetail } from "./implementations/gmarket-detail-enricher";
import { enrichOliveYoungProductDetail } from "./implementations/oliveyoung-detail-enricher";
import type { TranslationCache, ImageSearchCache } from "./cache";

export interface PipelineDependencies {
  scraper: Scraper;
  translator: Translator;
  imageProvider: ImageProvider;
  translationCache?: TranslationCache;
  imageCache?: ImageSearchCache;
  cacheEnabled?: boolean;
  debugCache?: boolean;
  imageSearchCx?: string;
}

export function buildTranslator(
  config: PipelineProvidersConfig
): Translator {
  if (
    config.translationProvider === "google_api_key" &&
    config.googleApiKey
  ) {
    return new GoogleTranslateApiKeyTranslator(
      config.googleApiKey,
      config.debugGoogle
    );
  }
  return new StubTranslator();
}

export function buildImageProvider(
  config: PipelineProvidersConfig
): ImageProvider {
  if (
    config.imageProvider === "custom_search" &&
    config.googleApiKey &&
    config.customSearchEngineId
  ) {
    return new GoogleCustomSearchImageProvider(
      config.googleApiKey,
      config.customSearchEngineId,
      config.debugGoogle
    );
  }
  return new StubImageProvider();
}

export async function runImportPipeline(
  params: ImportRunRequest & { categoryUrl: string; includeDetails?: boolean; detailConcurrency?: number },
  deps: PipelineDependencies
): Promise<ProcessedProduct[]> {
  // Step 1: Fetch raw products from scraper
  const rawProducts = await deps.scraper.fetchProducts({
    store: params.store,
    categoryKey: params.categoryKey,
    categoryUrl: params.categoryUrl,
    limit: params.limit,
  });

  // Ensure all products have stable sourceUrl
  for (const product of rawProducts) {
    if (!product.sourceUrl || product.sourceUrl.trim() === "") {
      product.sourceUrl = generateStableSourceUrl(
        params.categoryUrl,
        product.title,
        product.price,
        product.imagesOriginal[0]
      );
    }
  }

  // Step 1.5: Enrich with detail pages (if enabled)
  if (params.includeDetails) {
    const concurrency = params.detailConcurrency || 3;
    
    // Choose enricher based on store
    const enrichProductDetail = 
      params.store === "gmarket"
        ? enrichGmarketProductDetail
        : params.store === "oliveyoung"
        ? enrichOliveYoungProductDetail
        : null;

    if (enrichProductDetail) {
      const enrichments = await mapWithConcurrency(
        rawProducts,
        concurrency,
        async (product, index) => {
          // Add delay between requests (200-500ms with jitter)
          if (index > 0) {
            await sleep(300, 150);
          }

          try {
            const enrichment = await enrichProductDetail(product.sourceUrl);
            return enrichment;
          } catch (error) {
            return {
              notes: `detail_error: ${error instanceof Error ? error.message : "Unknown error"}`,
            };
          }
        }
      );

      // Merge enrichment results into products
      for (let i = 0; i < rawProducts.length; i++) {
        const product = rawProducts[i];
        const enrichment = enrichments[i];

        // For OliveYoung: use fallback images if imagesOriginal is empty
        if (params.store === "oliveyoung") {
          if ((!product.imagesOriginal || product.imagesOriginal.length === 0) && 
              enrichment.imagesFromDetail && enrichment.imagesFromDetail.length > 0) {
            product.imagesOriginal = enrichment.imagesFromDetail;
          } else if (enrichment.imagesFromDetail && enrichment.imagesFromDetail.length > 0) {
            // Merge and dedupe if we already have images
            const allImages = [...product.imagesOriginal, ...enrichment.imagesFromDetail];
            const seen = new Set<string>();
            product.imagesOriginal = allImages.filter((url) => {
              const base = url.split("?")[0];
              if (seen.has(base)) return false;
              seen.add(base);
              return true;
            });
          }

          // For OliveYoung: use fallback description if descriptionOriginal is empty
          if ((!product.descriptionOriginal || product.descriptionOriginal.trim().length === 0) && 
              enrichment.descriptionOriginal) {
            product.descriptionOriginal = enrichment.descriptionOriginal;
          }
        } else {
          // For Gmarket: existing logic
          // Merge description: use detail if list description is empty or too short
          if (enrichment.descriptionOriginal) {
            if (!product.descriptionOriginal || product.descriptionOriginal.length < 50) {
              product.descriptionOriginal = enrichment.descriptionOriginal;
            }
          }

          // Merge images: combine and dedupe
          if (enrichment.imagesFromDetail && enrichment.imagesFromDetail.length > 0) {
            const allImages = [...product.imagesOriginal, ...enrichment.imagesFromDetail];
            const seen = new Set<string>();
            product.imagesOriginal = allImages.filter((url) => {
              const base = url.split("?")[0];
              if (seen.has(base)) return false;
              seen.add(base);
              return true;
            });
          }
        }

        // Store detail errors in a temporary field (will be moved to notes later)
        if (enrichment.notes) {
          // Store error temporarily - we'll extract it in processing step
          (product as any).__detailError = enrichment.notes;
        }
      }
    }
  }

  // Step 2: Process each product (translate + update images) with resilient error handling
  const processedProducts: ProcessedProduct[] = [];
  const stubTranslator = new StubTranslator();
  const stubImageProvider = new StubImageProvider();

  for (const rawProduct of rawProducts) {
    let descriptionTranslated = "";
    let imagesProcessed: string[] = [];
    const errors: string[] = [];

    // Try to translate description (with caching)
    try {
      // Check cache first if enabled
      if (deps.cacheEnabled && deps.translationCache) {
        const cached = await deps.translationCache.get({
          from: rawProduct.langOriginal,
          to: params.translateTo,
          text: rawProduct.descriptionOriginal,
        });
        if (cached !== null) {
          descriptionTranslated = cached;
          // Skip translator call if cache hit
        } else {
          // Cache miss, call translator
          descriptionTranslated = await deps.translator.translate(
            rawProduct.descriptionOriginal,
            {
              from: rawProduct.langOriginal,
              to: params.translateTo,
            }
          );
          // Cache the result
          await deps.translationCache.set(
            {
              from: rawProduct.langOriginal,
              to: params.translateTo,
              text: rawProduct.descriptionOriginal,
            },
            descriptionTranslated
          );
        }
      } else {
        // Cache disabled, call translator directly
        descriptionTranslated = await deps.translator.translate(
          rawProduct.descriptionOriginal,
          {
            from: rawProduct.langOriginal,
            to: params.translateTo,
          }
        );
      }
    } catch (error) {
      // Fallback to stub translator
      const errorMessage =
        error instanceof Error ? error.message : "Unknown translation error";
      errors.push(`translation_error: ${errorMessage}`);
      
      try {
        descriptionTranslated = await stubTranslator.translate(
          rawProduct.descriptionOriginal,
          {
            from: rawProduct.langOriginal,
            to: params.translateTo,
          }
        );
      } catch (stubError) {
        // Even stub failed, use fallback string
        descriptionTranslated = `[${params.translateTo}] ${rawProduct.descriptionOriginal}`;
      }
    }

    // Try to get processed images (only if imageMode is not "none")
    if (params.imageMode !== "none") {
      try {
        // Check cache for image search (only for search mode)
        if (params.imageMode === "search" && deps.cacheEnabled && deps.imageCache) {
          // Build query same way as GoogleCustomSearchImageProvider
          const query = `${rawProduct.title} ${rawProduct.descriptionOriginal || ""}`.trim();
          // Get cx from deps if available (passed from API)
          const cx = (deps as any).imageSearchCx || "";
          if (cx) {
            const cachedUrls = await deps.imageCache.get({ query, cx });
            if (cachedUrls !== null && cachedUrls.length > 0) {
              imagesProcessed = cachedUrls;
            } else {
              // Cache miss, call provider
              imagesProcessed = await deps.imageProvider.searchOrGenerateImages(
                rawProduct,
                {
                  imageMode: params.imageMode,
                }
              );
              // Cache the result
              if (imagesProcessed.length > 0) {
                await deps.imageCache.set({ query, cx }, imagesProcessed);
              }
            }
          } else {
            // No cx available, call provider directly
            imagesProcessed = await deps.imageProvider.searchOrGenerateImages(
              rawProduct,
              {
                imageMode: params.imageMode,
              }
            );
          }
        } else {
          // Not search mode or cache disabled, call provider directly
          imagesProcessed = await deps.imageProvider.searchOrGenerateImages(
            rawProduct,
            {
              imageMode: params.imageMode,
            }
          );
        }
      } catch (error) {
        // Fallback to stub image provider
        const errorMessage =
          error instanceof Error ? error.message : "Unknown image error";
        errors.push(`image_error: ${errorMessage}`);

        try {
          imagesProcessed = await stubImageProvider.searchOrGenerateImages(
            rawProduct,
            {
              imageMode: params.imageMode,
            }
          );
        } catch (stubError) {
          // Even stub failed, use empty array
          imagesProcessed = [];
        }
      }
    }

    // Determine status based on processing
    let status: ProcessedProduct["status"] = "imported";
    if (descriptionTranslated && !descriptionTranslated.startsWith("[")) {
      status = "translated";
    }
    if (imagesProcessed.length > 0) {
      status = "images_updated";
    }
    if (
      descriptionTranslated &&
      !descriptionTranslated.startsWith("[") &&
      imagesProcessed.length > 0
    ) {
      status = "ready";
    }

    // If there were errors but we still have data, mark as ready but note errors
    if (errors.length > 0 && (descriptionTranslated || imagesProcessed.length > 0)) {
      status = "ready";
    }

    // Build notes from errors
    const notes = errors.length > 0 ? errors.join("; ") : undefined;

    processedProducts.push({
      ...rawProduct,
      descriptionTranslated,
      langTranslated: params.translateTo,
      imagesProcessed,
      status,
      notes,
    });
  }

  return processedProducts;
}

