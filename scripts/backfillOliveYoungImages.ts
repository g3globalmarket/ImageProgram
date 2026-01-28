/**
 * Backfill OliveYoung products with images and descriptions from detail pages
 * Uses og:image, JSON-LD, and meta tags as fallbacks for dynamic content
 */

import { connectDatabase, disconnectDatabase } from "../apps/api/src/db/connection.js";
import { Product } from "../apps/api/src/models/Product.js";
import { enrichOliveYoungProductDetail } from "../packages/core/src/implementations/oliveyoung-detail-enricher.js";

const CONCURRENCY = 3;
const REQUEST_TIMEOUT_MS = 10000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processProduct(product: any, index: number): Promise<void> {
  if (index > 0) {
    // Add delay between requests (200-500ms with jitter)
    await sleep(200 + Math.random() * 300);
  }

  try {
    console.log(`[${index + 1}] Processing: ${product.title} (${product._id})`);

    const enrichment = await enrichOliveYoungProductDetail(product.sourceUrl);

    const updates: any = {};

    // Update images if empty and we got fallback images
    if ((!product.imagesOriginal || product.imagesOriginal.length === 0) && 
        enrichment.imagesFromDetail && enrichment.imagesFromDetail.length > 0) {
      updates.imagesOriginal = enrichment.imagesFromDetail;
      console.log(`  ✓ Added ${enrichment.imagesFromDetail.length} image(s)`);
    } else if (!product.imagesOriginal || product.imagesOriginal.length === 0) {
      console.log(`  ⚠ No images found (fallback failed)`);
      if (!updates.notes) updates.notes = "";
      updates.notes = (updates.notes + " images_fallback_failed").trim();
    }

    // Update description if empty and we got fallback description
    if ((!product.descriptionOriginal || product.descriptionOriginal.trim().length === 0) && 
        enrichment.descriptionOriginal) {
      updates.descriptionOriginal = enrichment.descriptionOriginal;
      console.log(`  ✓ Added description (${enrichment.descriptionOriginal.length} chars)`);
    } else if (!product.descriptionOriginal || product.descriptionOriginal.trim().length === 0) {
      console.log(`  ⚠ No description found (fallback failed)`);
      if (!updates.notes) updates.notes = product.notes || "";
      updates.notes = (updates.notes + " description_fallback_failed").trim();
    }

    // Only update if we have changes
    if (Object.keys(updates).length > 0) {
      await Product.updateOne(
        { _id: product._id },
        { $set: updates }
      );
      console.log(`  ✓ Updated product`);
    } else {
      console.log(`  - No updates needed`);
    }
  } catch (error) {
    console.error(`  ❌ Error processing product:`, error instanceof Error ? error.message : "Unknown error");
    // Continue processing other products
  }
}

async function backfillProducts() {
  console.log("Connecting to MongoDB...");
  await connectDatabase();
  console.log("✅ Connected to MongoDB\n");

  // Find products where store="oliveyoung" and imagesOriginal is empty
  const products = await Product.find({
    store: "oliveyoung",
    $or: [
      { imagesOriginal: { $exists: false } },
      { imagesOriginal: { $size: 0 } },
      { imagesOriginal: [] },
    ],
  }).limit(100); // Limit to 100 for safety

  console.log(`Found ${products.length} products to backfill\n`);

  if (products.length === 0) {
    console.log("No products to backfill. Exiting.");
    await disconnectDatabase();
    return;
  }

  // Process products with concurrency limit
  let processed = 0;
  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map((product, batchIndex) => processProduct(product, i + batchIndex))
    );
    processed += batch.length;
    console.log(`\nProgress: ${processed}/${products.length}\n`);
  }

  console.log("\n✅ Backfill completed!");
  console.log(`   Processed: ${processed} products`);

  await disconnectDatabase();
  console.log("\n✅ Disconnected from MongoDB");
}

backfillProducts().catch((error) => {
  console.error("❌ Backfill failed:", error);
  process.exit(1);
});

