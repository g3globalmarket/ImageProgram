/**
 * One-time cleanup script to fix markdown-formatted image URLs in database
 * Finds products with markdown links like [https://...](https://...) and normalizes them
 */

import { connectDatabase, disconnectDatabase } from "../apps/api/src/db/connection.js";
import { Product } from "../apps/api/src/models/Product.js";
import { normalizeImageUrls } from "../packages/core/src/utils/normalizeUrl.js";

const CONCURRENCY = 5;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processProduct(product: any, index: number): Promise<boolean> {
  if (index > 0 && index % CONCURRENCY === 0) {
    // Small delay every batch
    await sleep(100);
  }

  try {
    let updated = false;
    const updates: any = {};

    // Check and normalize imagesOriginal
    if (product.imagesOriginal && Array.isArray(product.imagesOriginal) && product.imagesOriginal.length > 0) {
      // Check if any URL contains markdown pattern
      const hasMarkdown = product.imagesOriginal.some((url: string) => 
        url && typeof url === "string" && url.includes("](")
      );

      if (hasMarkdown) {
        const normalized = normalizeImageUrls(product.imagesOriginal, "https://www.oliveyoung.co.kr", 10);
        // Only update if changed
        if (JSON.stringify(normalized) !== JSON.stringify(product.imagesOriginal)) {
          updates.imagesOriginal = normalized;
          updated = true;
        }
      }
    }

    // Check and normalize imagesProcessed
    if (product.imagesProcessed && Array.isArray(product.imagesProcessed) && product.imagesProcessed.length > 0) {
      // Check if any URL contains markdown pattern
      const hasMarkdown = product.imagesProcessed.some((url: string) => 
        url && typeof url === "string" && url.includes("](")
      );

      if (hasMarkdown) {
        const normalized = normalizeImageUrls(product.imagesProcessed, "https://www.oliveyoung.co.kr", 10);
        // Only update if changed
        if (JSON.stringify(normalized) !== JSON.stringify(product.imagesProcessed)) {
          updates.imagesProcessed = normalized;
          updated = true;
        }
      }
    }

    if (updated) {
      await Product.updateOne(
        { _id: product._id },
        { $set: updates }
      );
      return true;
    }

    return false;
  } catch (error) {
    console.error(`  ❌ Error processing product ${product._id}:`, error instanceof Error ? error.message : "Unknown error");
    return false;
  }
}

async function fixMarkdownUrls() {
  console.log("Connecting to MongoDB...");
  await connectDatabase();
  console.log("✅ Connected to MongoDB\n");

  // Find all oliveyoung products, then filter in memory for markdown URLs
  // (MongoDB array regex queries are complex, so we filter in JS)
  const allProducts = await Product.find({
    store: "oliveyoung",
    $or: [
      { imagesOriginal: { $exists: true, $ne: [] } },
      { imagesProcessed: { $exists: true, $ne: [] } },
    ],
  });

  // Filter products that have markdown URLs
  const products = allProducts.filter((product) => {
    const hasMarkdownInOriginal = product.imagesOriginal?.some((url: string) => 
      url && typeof url === "string" && url.includes("](")
    );
    const hasMarkdownInProcessed = product.imagesProcessed?.some((url: string) => 
      url && typeof url === "string" && url.includes("](")
    );
    return hasMarkdownInOriginal || hasMarkdownInProcessed;
  });

  console.log(`Found ${products.length} products with markdown-formatted image URLs\n`);

  if (products.length === 0) {
    console.log("No products to fix. Exiting.");
    await disconnectDatabase();
    return;
  }

  // Process products with concurrency
  let matched = products.length;
  let updated = 0;

  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((product, batchIndex) => processProduct(product, i + batchIndex))
    );
    
    const batchUpdated = results.filter(Boolean).length;
    updated += batchUpdated;
    
    if (batchUpdated > 0) {
      console.log(`Processed ${Math.min(i + CONCURRENCY, products.length)}/${products.length} - Updated ${batchUpdated} in this batch`);
    }
  }

  console.log("\n✅ Cleanup completed!");
  console.log(`   Matched: ${matched} products`);
  console.log(`   Updated: ${updated} products`);

  await disconnectDatabase();
  console.log("\n✅ Disconnected from MongoDB");
}

fixMarkdownUrls().catch((error) => {
  console.error("❌ Cleanup failed:", error);
  process.exit(1);
});

