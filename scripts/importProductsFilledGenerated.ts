/**
 * Import products from products_filled_generated.json into MongoDB
 * Idempotent upsert based on (store + sourceUrl) uniqueness
 */

import { readFileSync } from "fs";
import { join } from "path";
import { connectDatabase, disconnectDatabase } from "../apps/api/src/db/connection.js";
import { Product } from "../apps/api/src/models/Product.js";
import { extractUrlFromMarkdown, normalizeHttpUrl, normalizeImageUrls } from "../packages/core/src/utils/normalizeUrl.js";
import { autoEnrichImagesForProducts } from "../apps/api/src/services/autoImageEnricher.js";

interface IncomingProduct {
  store?: string;
  categoryKey?: string;
  topCategory?: string;
  subCategory?: string;
  rank?: number;
  sourceUrl?: string;
  externalId?: string;
  title?: string;
  brand?: string;
  price?: number | string;
  originalPrice?: number | string | null;
  currency?: string;
  imagesOriginal?: string[];
  imagesProcessed?: string[];
  descriptionOriginal?: string;
  descriptionTranslated?: string;
  langOriginal?: string;
  langTranslated?: string;
  status?: string;
  notes?: string | string[];
}

interface ImportResult {
  total: number;
  matched: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Normalize HTTP URL (strict - only accepts http/https)
 */
function normalizeHttpUrlStrict(input?: string | null): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return null;
}

/**
 * Extract URL from markdown link format (strict pattern)
 */
function extractUrlFromMarkdownStrict(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  
  // Standard markdown: [text](https://url) - must match exactly
  const match = trimmed.match(/^\s*\[.*?\]\((https?:\/\/[^)]+)\)\s*$/);
  if (match) {
    return match[1];
  }
  
  return trimmed;
}

/**
 * Normalize numeric price
 */
function normalizePrice(input: unknown): number | null {
  if (typeof input === "number") {
    return isNaN(input) || input < 0 ? null : Math.floor(input);
  }
  
  if (typeof input === "string") {
    // Remove commas, ₩, spaces, and parse
    const cleaned = input.replace(/[₩,\s]/g, "");
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) || parsed < 0 ? null : parsed;
  }
  
  return null;
}

/**
 * Normalize notes field (can be string or array)
 */
function normalizeNotes(input: unknown): string | undefined {
  if (typeof input === "string") {
    return input.trim() || undefined;
  }
  if (Array.isArray(input)) {
    const strings = input.filter((item): item is string => typeof item === "string");
    return strings.length > 0 ? strings.join("; ") : undefined;
  }
  return undefined;
}

/**
 * Normalize a single product
 */
function normalizeProduct(item: IncomingProduct, index: number): {
  product: any;
  error?: string;
} {
  // Store (required)
  const store = item.store?.trim();
  if (!store || !["gmarket", "11st", "oliveyoung"].includes(store)) {
    return {
      product: null,
      error: `Row ${index + 1}: Invalid or missing store: ${item.store}`,
    };
  }

  // SourceUrl (required, normalize from markdown if needed)
  let sourceUrl = item.sourceUrl?.trim() || "";
  sourceUrl = extractUrlFromMarkdownStrict(sourceUrl);
  const normalizedSourceUrl = normalizeHttpUrlStrict(sourceUrl);
  if (!normalizedSourceUrl) {
    return {
      product: null,
      error: `Row ${index + 1}: Invalid or missing sourceUrl: ${item.sourceUrl}`,
    };
  }

  // Title (required, with fallback)
  let title = item.title?.trim() || "";
  if (!title) {
    title = "(missing title)";
  }

  // CategoryKey (default if missing)
  const categoryKey = item.categoryKey?.trim() || "ranking_all";

  // Price
  const price = normalizePrice(item.price);
  if (price === null) {
    return {
      product: null,
      error: `Row ${index + 1}: Invalid price: ${item.price}`,
    };
  }

  // OriginalPrice (optional)
  const originalPrice = item.originalPrice !== undefined && item.originalPrice !== null
    ? normalizePrice(item.originalPrice)
    : null;

  // Currency
  const currency = item.currency?.trim() || "KRW";

  // Images (normalize with base URL based on store)
  const baseUrl = store === "oliveyoung"
    ? "https://www.oliveyoung.co.kr"
    : store === "gmarket"
    ? "https://m.gmarket.co.kr"
    : undefined;

  const imagesOriginal = normalizeImageUrls(
    Array.isArray(item.imagesOriginal) ? item.imagesOriginal : [],
    baseUrl,
    10
  );
  const imagesProcessed = normalizeImageUrls(
    Array.isArray(item.imagesProcessed) ? item.imagesProcessed : [],
    baseUrl,
    10
  );

  // Descriptions
  const descriptionOriginal = item.descriptionOriginal?.trim() || "";
  const descriptionTranslated = item.descriptionTranslated?.trim() || "";

  // Language
  const langOriginal = item.langOriginal?.trim() || "ko";
  const langTranslated = item.langTranslated?.trim() || "mn";

  // Status
  const status = item.status?.trim() || "imported";
  if (!["imported", "translated", "images_updated", "ready", "error"].includes(status)) {
    return {
      product: null,
      error: `Row ${index + 1}: Invalid status: ${status}`,
    };
  }

  // Notes
  const notes = normalizeNotes(item.notes);

  return {
    product: {
      store,
      categoryKey,
      sourceUrl: normalizedSourceUrl,
      title,
      price,
      originalPrice,
      currency,
      imagesOriginal,
      imagesProcessed,
      descriptionOriginal,
      descriptionTranslated,
      langOriginal,
      langTranslated,
      status,
      notes,
      lockedFields: [], // Will be preserved from existing if present
    },
  };
}

async function importProducts() {
  console.log("Connecting to MongoDB...");
  await connectDatabase();
  console.log("✅ Connected to MongoDB\n");

  // Read JSON file (from project root)
  // Script is run from apps/api, so go up one level to project root
  const jsonPath = join(process.cwd(), "../products_filled_generated.json");
  console.log(`Reading ${jsonPath}...`);
  const fileContent = readFileSync(jsonPath, "utf-8");
  const data = JSON.parse(fileContent);

  // Handle both shapes: { products: [...] } or [...]
  const productsArray = Array.isArray(data) ? data : data.products || [];
  
  if (!Array.isArray(productsArray)) {
    throw new Error("JSON file must contain a 'products' array or be an array directly");
  }

  console.log(`Found ${productsArray.length} products in file\n`);

  if (productsArray.length === 0) {
    console.log("No products to import. Exiting.");
    await disconnectDatabase();
    return;
  }

  // Example keys from first item
  if (productsArray.length > 0) {
    const exampleKeys = Object.keys(productsArray[0]);
    console.log(`Example keys: ${exampleKeys.slice(0, 10).join(", ")}${exampleKeys.length > 10 ? "..." : ""}\n`);
  }

  const result: ImportResult = {
    total: productsArray.length,
    matched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  // Normalize all products first
  const normalizedProducts: Array<{ product: any; index: number }> = [];
  const categoryKeyDefaults = new Set<number>();

  for (let i = 0; i < productsArray.length; i++) {
    const item = productsArray[i] as IncomingProduct;
    const normalized = normalizeProduct(item, i);

    if (normalized.error) {
      result.skipped++;
      result.errors.push(normalized.error);
      continue;
    }

    if (!normalized.product) {
      result.skipped++;
      result.errors.push(`Row ${i + 1}: Normalization returned null product`);
      continue;
    }

    // Track categoryKey defaults
    if (!item.categoryKey || !item.categoryKey.trim()) {
      categoryKeyDefaults.add(i);
    }

    normalizedProducts.push({ product: normalized.product, index: i });
  }

  // Fetch existing products to preserve lockedFields (batch query)
  const existingProductsMap = new Map<string, any>();
  if (normalizedProducts.length > 0) {
    const queries = normalizedProducts.map((np) => ({
      store: np.product.store,
      sourceUrl: np.product.sourceUrl,
    }));
    
    const existing = await Product.find({
      $or: queries,
    });
    
    for (const ep of existing) {
      const key = `${ep.store}::${ep.sourceUrl}`;
      existingProductsMap.set(key, ep);
    }
  }

  // Prepare bulk operations
  const bulkOps: any[] = [];

  for (const { product } of normalizedProducts) {
    const key = `${product.store}::${product.sourceUrl}`;
    const existing = existingProductsMap.get(key);

    const lockedFields = existing?.lockedFields || [];
    const fieldsToProtect = new Set(lockedFields);

    // Build update object, excluding locked fields
    const update: any = {
      categoryKey: product.categoryKey,
      currency: product.currency,
      imagesOriginal: product.imagesOriginal,
      descriptionOriginal: product.descriptionOriginal,
      langOriginal: product.langOriginal,
      langTranslated: product.langTranslated,
    };

    // Only update non-locked fields
    if (!fieldsToProtect.has("title")) {
      update.title = product.title;
    }
    if (!fieldsToProtect.has("price")) {
      update.price = product.price;
    }
    if (!fieldsToProtect.has("imagesProcessed")) {
      update.imagesProcessed = product.imagesProcessed;
    }
    if (!fieldsToProtect.has("descriptionTranslated")) {
      update.descriptionTranslated = product.descriptionTranslated;
    }
    if (!fieldsToProtect.has("status")) {
      update.status = product.status;
    }
    if (!fieldsToProtect.has("notes")) {
      update.notes = product.notes;
    }

    // Add optional fields if present
    if (product.originalPrice !== null && product.originalPrice !== undefined) {
      update.originalPrice = product.originalPrice;
    }

    bulkOps.push({
      updateOne: {
        filter: {
          store: product.store,
          sourceUrl: product.sourceUrl,
        },
        update: {
          $set: update,
          $setOnInsert: {
            lockedFields: [],
          },
        },
        upsert: true,
      },
    });
  }

  if (categoryKeyDefaults.size > 0) {
    console.log(`⚠️  ${categoryKeyDefaults.size} products had missing categoryKey (defaulted to "ranking_all")\n`);
  }

  console.log(`Prepared ${bulkOps.length} operations (${result.skipped} skipped)\n`);
  console.log("Executing bulk upsert...");

  // Execute bulk operations
  const bulkResult = await Product.bulkWrite(bulkOps, { ordered: false });

  result.matched = bulkResult.matchedCount || 0;
  result.inserted = bulkResult.upsertedCount || 0;
  result.updated = bulkResult.modifiedCount || 0;

  console.log("\n✅ Import completed!");
  console.log(`   Total in file: ${result.total}`);
  console.log(`   Matched: ${result.matched}`);
  console.log(`   Inserted: ${result.inserted}`);
  console.log(`   Updated: ${result.updated}`);
  console.log(`   Skipped: ${result.skipped}`);

  if (result.errors.length > 0) {
    console.log(`\n⚠️  ${result.errors.length} errors occurred:`);
    result.errors.slice(0, 10).forEach((err) => {
      console.log(`   - ${err}`);
    });
    if (result.errors.length > 10) {
      console.log(`   ... and ${result.errors.length - 10} more`);
    }
  }

  // Auto-enrich images for products with no images
  const upsertedIds = Object.values(bulkResult.upsertedIds || {}).map((id) => id.toString());
  if (upsertedIds.length > 0) {
    try {
      // Fetch inserted and updated products
      const affectedProducts = await Product.find({
        _id: { $in: upsertedIds },
      }).lean();

      if (affectedProducts.length > 0) {
        const enrichResult = await autoEnrichImagesForProducts(affectedProducts as any);
        console.log(
          `\n📸 Auto image enrichment: checked=${enrichResult.checked}, ` +
          `enriched=${enrichResult.enriched}, skipped=${enrichResult.skipped}, failed=${enrichResult.failed}`
        );
      }
    } catch (error) {
      console.warn(`\n⚠️  Auto image enrichment failed: ${error instanceof Error ? error.message : String(error)}`);
      // Don't fail the import if enrichment fails
    }
  }

  await disconnectDatabase();
  console.log("\n✅ Disconnected from MongoDB");
}

importProducts().catch((error) => {
  console.error("❌ Import failed:", error);
  process.exit(1);
});

