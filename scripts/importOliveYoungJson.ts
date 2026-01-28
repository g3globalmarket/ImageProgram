/**
 * Import OliveYoung products from OL.json into MongoDB
 */

import { readFileSync } from "fs";
import { join } from "path";
import { connectDatabase, disconnectDatabase } from "../apps/api/src/db/connection.js";
import { Product } from "../apps/api/src/models/Product.js";
import { normalizeImageUrls } from "../packages/core/src/utils/normalizeUrl.js";

interface OliveYoungProduct {
  store: string;
  categoryKey: string;
  topCategory?: string;
  subCategory?: string;
  rank?: number;
  sourceUrl: string;
  externalId?: string;
  title: string;
  brand?: string;
  price: number;
  originalPrice?: number | null;
  currency: string;
  imagesOriginal: string[];
  imagesProcessed: string[];
  descriptionOriginal: string;
  descriptionTranslated: string;
  langOriginal: string;
  langTranslated: string;
  status: string;
  notes?: string;
}

interface OliveYoungJson {
  meta: {
    date_seoul: string;
    store: string;
    ranking_type: string;
    ranking_source_page: string;
    notes: string;
    sources: string[];
  };
  products: OliveYoungProduct[];
}

/**
 * Extract URL from markdown link format: [url](url) -> url
 */
function extractUrl(markdownLink: string): string {
  if (!markdownLink) return "";
  // Match markdown link pattern [text](url)
  const match = markdownLink.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (match) {
    return match[2]; // Return the URL part
  }
  // If not markdown, return as-is
  return markdownLink;
}

async function importProducts() {
  console.log("Connecting to MongoDB...");
  await connectDatabase();
  console.log("✅ Connected to MongoDB");

  // Read JSON file
  const jsonPath = join(__dirname, "../OL.json");
  console.log(`Reading ${jsonPath}...`);
  const fileContent = readFileSync(jsonPath, "utf-8");
  const data: OliveYoungJson = JSON.parse(fileContent);

  if (!data.products || !Array.isArray(data.products)) {
    throw new Error("JSON file must have a 'products' array");
  }

  console.log(`Found ${data.products.length} products to import`);

  // Prepare bulk operations
  const bulkOps = data.products.map((item) => {
    // Extract URL from markdown format if needed
    const sourceUrl = extractUrl(item.sourceUrl);

    // Normalize image URLs (handle markdown format and relative URLs)
    const imagesOriginal = normalizeImageUrls(
      Array.isArray(item.imagesOriginal) ? item.imagesOriginal : [],
      "https://www.oliveyoung.co.kr",
      10
    );
    const imagesProcessed = normalizeImageUrls(
      Array.isArray(item.imagesProcessed) ? item.imagesProcessed : [],
      "https://www.oliveyoung.co.kr",
      10
    );

    // Map JSON fields to Product model
    const product = {
      store: item.store || "oliveyoung",
      categoryKey: item.categoryKey || "ranking_all",
      sourceUrl: sourceUrl,
      title: item.title || "",
      price: item.price || 0,
      currency: item.currency || "KRW",
      imagesOriginal: imagesOriginal,
      imagesProcessed: imagesProcessed,
      descriptionOriginal: item.descriptionOriginal || "",
      descriptionTranslated: item.descriptionTranslated || "",
      langOriginal: item.langOriginal || "ko",
      langTranslated: item.langTranslated || "",
      status: (item.status || "imported") as "imported" | "translated" | "images_updated" | "ready" | "error",
      notes: item.notes || undefined,
      lockedFields: [] as string[],
    };

    return {
      updateOne: {
        filter: {
          store: product.store,
          sourceUrl: product.sourceUrl,
        },
        update: {
          $set: product,
        },
        upsert: true,
      },
    };
  });

  console.log("Inserting/updating products...");
  const result = await Product.bulkWrite(bulkOps, { ordered: false });

  console.log("\n✅ Import completed!");
  console.log(`   Matched: ${result.matchedCount || 0}`);
  console.log(`   Inserted: ${result.upsertedCount || 0}`);
  console.log(`   Updated: ${result.modifiedCount || 0}`);
  console.log(`   Errors: ${result.writeErrors?.length || 0}`);

  if (result.writeErrors && result.writeErrors.length > 0) {
    console.log("\n⚠️  Some errors occurred:");
    result.writeErrors.slice(0, 5).forEach((err) => {
      console.log(`   - ${err.errmsg}`);
    });
  }

  await disconnectDatabase();
  console.log("\n✅ Disconnected from MongoDB");
}

importProducts().catch((error) => {
  console.error("❌ Import failed:", error);
  process.exit(1);
});

