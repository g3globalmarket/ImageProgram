/**
 * Demo Mode: Load products from local JSON file instead of web scraping
 */

import { readFileSync, existsSync } from "fs";
import { join, resolve } from "path";
import { normalizeImageUrls, extractUrlFromMarkdown, normalizeHttpUrl } from "../utils/normalizeUrl";

export type DemoProduct = {
  store: string;
  categoryKey: string;
  sourceUrl: string;
  title: string;
  price?: number | null;
  currency?: string;
  imagesOriginal?: string[];
  imagesProcessed?: string[];
  descriptionOriginal?: string;
  descriptionTranslated?: string;
  topCategory?: string;
  subCategory?: string | null;
  rank?: number;
  brand?: string;
  notes?: string;
  langOriginal?: string;
  langTranslated?: string;
  status?: string;
};

interface LoadedData {
  products: DemoProduct[];
  loadedAt: number;
}

// In-memory cache
let cachedData: LoadedData | null = null;

/**
 * Resolve the JSON file path relative to repo root
 */
function resolveJsonPath(filePath: string): string {
  // If absolute path, use as-is
  if (filePath.startsWith("/")) {
    return filePath;
  }

  // Try to find repo root by looking for package.json
  let currentDir = process.cwd();
  const maxDepth = 10;
  let depth = 0;

  while (depth < maxDepth) {
    if (existsSync(join(currentDir, "package.json"))) {
      return resolve(currentDir, filePath);
    }
    const parent = resolve(currentDir, "..");
    if (parent === currentDir) {
      break; // Reached filesystem root
    }
    currentDir = parent;
    depth++;
  }

  // Fallback: resolve from current working directory
  return resolve(process.cwd(), filePath);
}

/**
 * Normalize a demo product
 */
function normalizeDemoProduct(item: any): DemoProduct | null {
  if (!item.store || !item.sourceUrl || !item.title) {
    return null;
  }

  // Normalize sourceUrl (extract from markdown if needed)
  let sourceUrl = item.sourceUrl?.trim() || "";
  sourceUrl = extractUrlFromMarkdown(sourceUrl);
  const normalizedSourceUrl = normalizeHttpUrl(sourceUrl);
  if (!normalizedSourceUrl) {
    return null;
  }

  // Normalize images with store-specific base URL
  const baseUrl =
    item.store === "oliveyoung"
      ? "https://www.oliveyoung.co.kr"
      : item.store === "gmarket"
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

  // Normalize price
  let price: number | null = null;
  if (typeof item.price === "number") {
    price = item.price;
  } else if (typeof item.price === "string") {
    const cleaned = item.price.replace(/[₩,\s]/g, "");
    const parsed = parseInt(cleaned, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      price = parsed;
    }
  }

  // Normalize notes (can be string or array)
  let notes: string | undefined = undefined;
  if (typeof item.notes === "string") {
    notes = item.notes.trim() || undefined;
  } else if (Array.isArray(item.notes)) {
    const strings = item.notes.filter((n: any): n is string => typeof n === "string");
    if (strings.length > 0) {
      notes = strings.join("; ");
    }
  }

  return {
    store: item.store,
    categoryKey: item.categoryKey || "ranking_all",
    sourceUrl: normalizedSourceUrl,
    title: item.title,
    price: price,
    currency: item.currency || "KRW",
    imagesOriginal: imagesOriginal,
    imagesProcessed: imagesProcessed,
    descriptionOriginal: item.descriptionOriginal || "",
    descriptionTranslated: item.descriptionTranslated || "",
    topCategory: item.topCategory,
    subCategory: item.subCategory ?? null,
    rank: typeof item.rank === "number" ? item.rank : undefined,
    brand: item.brand,
    notes: notes,
    langOriginal: item.langOriginal || "ko",
    langTranslated: item.langTranslated || "mn",
    status: item.status || "imported",
  };
}

/**
 * Load all demo products from JSON file (cached)
 */
export async function loadDemoProducts(filePath: string): Promise<DemoProduct[]> {
  // Return cached data if available
  if (cachedData) {
    return cachedData.products;
  }

  const resolvedPath = resolveJsonPath(filePath);
  
  if (!existsSync(resolvedPath)) {
    throw new Error(`Demo products file not found: ${resolvedPath}`);
  }

  const fileContent = readFileSync(resolvedPath, "utf-8");
  const data = JSON.parse(fileContent);

  // Handle both shapes: { products: [...] } or [...]
  const productsArray = Array.isArray(data) ? data : data.products || [];

  if (!Array.isArray(productsArray)) {
    throw new Error("JSON file must contain a 'products' array or be an array directly");
  }

  // Normalize all products
  const normalizedProducts: DemoProduct[] = [];
  for (const item of productsArray) {
    const normalized = normalizeDemoProduct(item);
    if (normalized) {
      normalizedProducts.push(normalized);
    }
  }

  // Cache the result
  cachedData = {
    products: normalizedProducts,
    loadedAt: Date.now(),
  };

  return normalizedProducts;
}

/**
 * Get demo products filtered by store and categoryKey
 * Returns products and metadata about the filtering process
 */
export async function getDemoProductsForRequest(args: {
  store: string;
  categoryKey: string;
  limit: number;
  filePath: string;
  delayMs?: number;
}): Promise<{
  products: DemoProduct[];
  metadata: {
    usedStoreFilter: boolean;
    requestedCategoryKey: string;
    usedFallbackStoreOnly: boolean;
    matchedInJson: number;
    availableCategoryKeys?: string[];
  };
}> {
  const allProducts = await loadDemoProducts(args.filePath);

  // Filter by store first
  const storeFiltered = allProducts.filter((p) => p.store === args.store);
  const storeCount = storeFiltered.length;

  if (storeCount === 0) {
    // No products for this store at all
    return {
      products: [],
      metadata: {
        usedStoreFilter: true,
        requestedCategoryKey: args.categoryKey,
        usedFallbackStoreOnly: false,
        matchedInJson: 0,
      },
    };
  }

  // Try to filter by categoryKey
  const categoryFiltered = storeFiltered.filter((p) => p.categoryKey === args.categoryKey);
  const categoryCount = categoryFiltered.length;

  let filtered: DemoProduct[];
  let usedFallbackStoreOnly = false;
  let availableCategoryKeys: string[] | undefined;

  if (categoryCount === 0) {
    // Fallback to store-only products
    filtered = storeFiltered;
    usedFallbackStoreOnly = true;
    
    // Get available categoryKeys for this store
    availableCategoryKeys = Array.from(
      new Set(storeFiltered.map((p) => p.categoryKey))
    ).sort();

    // Add note to first product (if any) about the fallback
    if (filtered.length > 0) {
      const existingNotes = filtered[0].notes || "";
      const fallbackNote = `demo_fallback_categoryKey_no_match: requested=${args.categoryKey}, available=[${availableCategoryKeys.join(", ")}]`;
      filtered[0].notes = existingNotes
        ? `${existingNotes}; ${fallbackNote}`
        : fallbackNote;
    }

    console.warn(
      `[Demo Mode] No products found for store=${args.store}, categoryKey=${args.categoryKey}. ` +
      `Using store-only filter (${storeCount} products). ` +
      `Available categoryKeys: [${availableCategoryKeys.join(", ")}]`
    );
  } else {
    filtered = categoryFiltered;
  }

  // Sort by rank if present
  filtered.sort((a, b) => {
    if (a.rank !== undefined && b.rank !== undefined) {
      return a.rank - b.rank;
    }
    if (a.rank !== undefined) return -1;
    if (b.rank !== undefined) return 1;
    return 0;
  });

  // Apply limit
  const limited = filtered.slice(0, args.limit);

  // Optional delay to mimic network
  if (args.delayMs && args.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, args.delayMs));
  }

  return {
    products: limited,
    metadata: {
      usedStoreFilter: true,
      requestedCategoryKey: args.categoryKey,
      usedFallbackStoreOnly: usedFallbackStoreOnly,
      matchedInJson: limited.length,
      availableCategoryKeys: usedFallbackStoreOnly ? availableCategoryKeys : undefined,
    },
  };
}

/**
 * Get demo products metadata (for status endpoint)
 */
export async function getDemoProductsMetadata(filePath: string): Promise<{
  loaded: boolean;
  totalProducts: number;
  stores: string[];
  categories: string[];
}> {
  try {
    const products = await loadDemoProducts(filePath);
    const stores = Array.from(new Set(products.map((p) => p.store))).sort();
    const categories = Array.from(new Set(products.map((p) => p.categoryKey))).sort();

    return {
      loaded: true,
      totalProducts: products.length,
      stores,
      categories,
    };
  } catch (error) {
    return {
      loaded: false,
      totalProducts: 0,
      stores: [],
      categories: [],
    };
  }
}

/**
 * Get demo products catalog (for debug endpoint)
 */
export async function getDemoProductsCatalog(filePath: string): Promise<{
  mode: "demo";
  filePath: string;
  totals: { products: number };
  stores: Record<
    string,
    {
      count: number;
      categoryKeys: string[];
    }
  >;
}> {
  try {
    const products = await loadDemoProducts(filePath);
    const storesMap = new Map<string, Set<string>>();
    const storeCounts = new Map<string, number>();

    // Group by store and collect categoryKeys
    for (const product of products) {
      const store = product.store;
      if (!storesMap.has(store)) {
        storesMap.set(store, new Set());
        storeCounts.set(store, 0);
      }
      storesMap.get(store)!.add(product.categoryKey);
      storeCounts.set(store, (storeCounts.get(store) || 0) + 1);
    }

    // Convert to response format
    const stores: Record<string, { count: number; categoryKeys: string[] }> = {};
    for (const [store, categoryKeysSet] of storesMap.entries()) {
      stores[store] = {
        count: storeCounts.get(store) || 0,
        categoryKeys: Array.from(categoryKeysSet).sort(),
      };
    }

    return {
      mode: "demo",
      filePath,
      totals: { products: products.length },
      stores,
    };
  } catch (error) {
    return {
      mode: "demo",
      filePath,
      totals: { products: 0 },
      stores: {},
    };
  }
}

