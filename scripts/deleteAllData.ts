/**
 * Delete all data from the database
 * WARNING: This will permanently delete ALL products, import runs, and cache entries!
 */

import { connectDatabase, disconnectDatabase } from "../apps/api/src/db/connection.js";
import { Product } from "../apps/api/src/models/Product.js";
import { ImportRun } from "../apps/api/src/models/ImportRun.js";
import { TranslationCacheEntry } from "../apps/api/src/models/TranslationCacheEntry.js";
import { ImageCacheEntry } from "../apps/api/src/models/ImageCacheEntry.js";

async function deleteAllData() {
  console.log("⚠️  WARNING: This will delete ALL data from the database!");
  console.log("   - All products");
  console.log("   - All import runs");
  console.log("   - All translation cache entries");
  console.log("   - All image cache entries\n");

  // Check for confirmation via environment variable or prompt
  const force = process.env.FORCE_DELETE === "true";
  
  if (!force) {
    console.log("To proceed, set FORCE_DELETE=true environment variable:");
    console.log("   FORCE_DELETE=true pnpm tsx scripts/deleteAllData.ts\n");
    console.log("Or run: cd apps/api && FORCE_DELETE=true pnpm tsx ../../scripts/deleteAllData.ts");
    process.exit(1);
  }

  console.log("Connecting to MongoDB...");
  await connectDatabase();
  console.log("✅ Connected to MongoDB\n");

  try {
    // Count documents before deletion
    const productCount = await Product.countDocuments();
    const importRunCount = await ImportRun.countDocuments();
    const translationCacheCount = await TranslationCacheEntry.countDocuments();
    const imageCacheCount = await ImageCacheEntry.countDocuments();

    console.log("Current database state:");
    console.log(`   Products: ${productCount}`);
    console.log(`   Import Runs: ${importRunCount}`);
    console.log(`   Translation Cache: ${translationCacheCount}`);
    console.log(`   Image Cache: ${imageCacheCount}\n`);

    if (productCount === 0 && importRunCount === 0 && translationCacheCount === 0 && imageCacheCount === 0) {
      console.log("Database is already empty. Nothing to delete.");
      await disconnectDatabase();
      return;
    }

    console.log("Deleting all data...\n");

    // Delete all products
    if (productCount > 0) {
      const productResult = await Product.deleteMany({});
      console.log(`✅ Deleted ${productResult.deletedCount} products`);
    }

    // Delete all import runs
    if (importRunCount > 0) {
      const importRunResult = await ImportRun.deleteMany({});
      console.log(`✅ Deleted ${importRunResult.deletedCount} import runs`);
    }

    // Delete all translation cache entries
    if (translationCacheCount > 0) {
      const translationCacheResult = await TranslationCacheEntry.deleteMany({});
      console.log(`✅ Deleted ${translationCacheResult.deletedCount} translation cache entries`);
    }

    // Delete all image cache entries
    if (imageCacheCount > 0) {
      const imageCacheResult = await ImageCacheEntry.deleteMany({});
      console.log(`✅ Deleted ${imageCacheResult.deletedCount} image cache entries`);
    }

    console.log("\n✅ All data deleted successfully!");

    // Verify deletion
    const remainingProducts = await Product.countDocuments();
    const remainingImportRuns = await ImportRun.countDocuments();
    const remainingTranslationCache = await TranslationCacheEntry.countDocuments();
    const remainingImageCache = await ImageCacheEntry.countDocuments();

    console.log("\nVerification:");
    console.log(`   Products remaining: ${remainingProducts}`);
    console.log(`   Import Runs remaining: ${remainingImportRuns}`);
    console.log(`   Translation Cache remaining: ${remainingTranslationCache}`);
    console.log(`   Image Cache remaining: ${remainingImageCache}`);

    if (remainingProducts === 0 && remainingImportRuns === 0 && remainingTranslationCache === 0 && remainingImageCache === 0) {
      console.log("\n✅ Database is now empty.");
    } else {
      console.log("\n⚠️  Warning: Some data may still remain.");
    }
  } catch (error) {
    console.error("\n❌ Error deleting data:", error);
    throw error;
  } finally {
    await disconnectDatabase();
    console.log("\n✅ Disconnected from MongoDB");
  }
}

deleteAllData().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});

