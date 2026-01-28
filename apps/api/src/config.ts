import dotenv from "dotenv";

dotenv.config();

export type AppConfig = typeof config;

export const config = {
  port: process.env.PORT || 3001,
  mongodbUri: process.env.MONGODB_URI || "mongodb://localhost:27017/products",
  googleCloudApiKey: process.env.GOOGLE_CLOUD_API_KEY || "",
  customSearchEngineId: process.env.CUSTOM_SEARCH_ENGINE_ID || "",
  imageProvider: (process.env.IMAGE_PROVIDER || "stub") as "stub" | "custom_search",
  translationProvider: (process.env.TRANSLATION_PROVIDER || "stub") as "stub" | "google_api_key",
  debugGoogle: process.env.DEBUG_GOOGLE === "1" || process.env.DEBUG_GOOGLE === "true",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  cacheEnabled: process.env.CACHE_ENABLED === "1" || process.env.CACHE_ENABLED === "true",
  cacheTtlDays: parseInt(process.env.CACHE_TTL_DAYS || "30", 10),
  debugCache: process.env.DEBUG_CACHE === "1" || process.env.DEBUG_CACHE === "true",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  importAsyncEnabled: process.env.IMPORT_ASYNC_ENABLED === "1" || process.env.IMPORT_ASYNC_ENABLED === "true",
  importJobConcurrency: parseInt(process.env.IMPORT_JOB_CONCURRENCY || "2", 10),
  importJobStallIntervalMs: parseInt(process.env.IMPORT_JOB_STALL_INTERVAL_MS || "30000", 10),
  debugQueue: process.env.DEBUG_QUEUE === "1" || process.env.DEBUG_QUEUE === "true",
  importMode: (process.env.IMPORT_MODE || "local") as "local" | "demo" | "real",
  localProductsJsonPath: process.env.LOCAL_PRODUCTS_FILE || process.env.LOCAL_PRODUCTS_JSON_PATH || "products_filled_generated.json",
  demoDelayMs: parseInt(process.env.DEMO_DELAY_MS || "400", 10),
  imageEnrichmentEnabled: process.env.IMAGE_ENRICHMENT_ENABLED === "1" || process.env.IMAGE_ENRICHMENT_ENABLED === "true",
  imageDownloadDir: process.env.IMAGE_DOWNLOAD_DIR || "uploads/products",
  publicImageBaseUrl: process.env.PUBLIC_IMAGE_BASE_URL || "/uploads/products",
  imageTargetCount: parseInt(process.env.IMAGE_TARGET_COUNT || "5", 10),
  imageMaxBytes: parseInt(process.env.IMAGE_MAX_BYTES || "5000000", 10),
  imageConcurrency: parseInt(process.env.IMAGE_CONCURRENCY || "3", 10),
  imageRights: process.env.IMAGE_RIGHTS || "",

  // AI Title Cleaning (Gemini API)
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  aiTitleCleaningEnabled: process.env.AI_TITLE_CLEANING_ENABLED === "true",
  aiTitleCleaningTimeoutMs: parseInt(process.env.AI_TITLE_CLEANING_TIMEOUT_MS || "6000", 10),
  aiTitleCleaningCacheMax: parseInt(process.env.AI_TITLE_CLEANING_CACHE_MAX || "2000", 10),
  
  // AI Translator concurrency and retry settings
  aiTranslatorConcurrency: parseInt(process.env.AI_TRANSLATOR_CONCURRENCY || "2", 10),
  aiTranslatorRetryMax: parseInt(process.env.AI_TRANSLATOR_RETRY_MAX || "6", 10),
  aiTranslatorBackoffMinMs: parseInt(process.env.AI_TRANSLATOR_BACKOFF_MIN_MS || "500", 10),
  aiTranslatorBackoffMaxMs: parseInt(process.env.AI_TRANSLATOR_BACKOFF_MAX_MS || "20000", 10),
  
  // Auto-translate title to Mongolian
  autoTranslateTitleMn: process.env.AUTO_TRANSLATE_TITLE_MN !== "false", // default true
  
  // Auto-enrich images on import
  autoEnrichImagesOnImport: process.env.AUTO_ENRICH_IMAGES_ON_IMPORT !== "false", // default true
  autoEnrichImagesTarget: parseInt(process.env.AUTO_ENRICH_IMAGES_TARGET || "5", 10),
  autoEnrichImagesConcurrency: parseInt(process.env.AUTO_ENRICH_IMAGES_CONCURRENCY || "2", 10),
  autoEnrichImagesMaxPerRun: parseInt(process.env.AUTO_ENRICH_IMAGES_MAX_PER_RUN || "30", 10),
};

