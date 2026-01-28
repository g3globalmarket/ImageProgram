/**
 * Verification script to ensure products are properly imported
 * Checks that products exist and have images
 */

import { connectDatabase, disconnectDatabase } from "../apps/api/src/db/connection.js";
import { Product } from "../apps/api/src/models/Product.js";

async function verifyProducts() {
  console.log("Connecting to MongoDB...");
  await connectDatabase();
  console.log("✅ Connected to MongoDB\n");

  try {
    // Get total product count
    const totalCount = await Product.countDocuments();
    console.log(`Total products in database: ${totalCount}`);

    if (totalCount === 0) {
      console.error("\n❌ FAILED: No products found in database");
      await disconnectDatabase();
      process.exit(1);
    }

    // Get products by store
    const stores = await Product.distinct("store");
    console.log(`\nStores found: ${stores.join(", ")}`);

    // Sample 5 products (prefer oliveyoung if available, else any store)
    const sampleStore = stores.includes("oliveyoung") ? "oliveyoung" : stores[0];
    const sampleProducts = await Product.find({ store: sampleStore })
      .limit(5)
      .select("title price store sourceUrl imagesOriginal imagesProcessed")
      .lean();

    console.log(`\nSampling ${sampleProducts.length} products from store: ${sampleStore}\n`);

    let productsWithImages = 0;
    let productsWithoutImages = 0;

    for (let i = 0; i < sampleProducts.length; i++) {
      const product = sampleProducts[i];
      const hasImages = 
        (product.imagesOriginal && product.imagesOriginal.length > 0) ||
        (product.imagesProcessed && product.imagesProcessed.length > 0);

      if (hasImages) {
        productsWithImages++;
      } else {
        productsWithoutImages++;
      }

      console.log(`Product ${i + 1}:`);
      console.log(`  Title: ${product.title}`);
      const currency = (product as any).currency || "KRW";
      console.log(`  Price: ${product.price} ${currency}`);
      console.log(`  Store: ${product.store}`);
      console.log(`  Source URL: ${product.sourceUrl}`);
      console.log(`  imagesOriginal: ${product.imagesOriginal?.length || 0} image(s)`);
      if (product.imagesOriginal && product.imagesOriginal.length > 0) {
        console.log(`    First image: ${product.imagesOriginal[0]}`);
      }
      console.log(`  imagesProcessed: ${product.imagesProcessed?.length || 0} image(s)`);
      console.log("");
    }

    // Check if all sampled products have images
    if (productsWithoutImages === sampleProducts.length) {
      console.error("\n❌ FAILED: All sampled products have empty image arrays");
      console.error("   UI will not be able to display images");
      await disconnectDatabase();
      process.exit(1);
    }

    if (productsWithoutImages > 0) {
      console.warn(`\n⚠️  WARNING: ${productsWithoutImages} of ${sampleProducts.length} sampled products have no images`);
    }

    // Additional check: count products with images
    const productsWithImagesCount = await Product.countDocuments({
      $or: [
        { imagesOriginal: { $exists: true, $ne: [], $not: { $size: 0 } } },
        { imagesProcessed: { $exists: true, $ne: [], $not: { $size: 0 } } },
      ],
    });

    console.log(`\nProducts with images: ${productsWithImagesCount} / ${totalCount}`);

    if (productsWithImagesCount === 0) {
      console.error("\n❌ FAILED: No products in database have images");
      await disconnectDatabase();
      process.exit(1);
    }

    console.log("\n✅ Verification passed!");
    console.log(`   Total products: ${totalCount}`);
    console.log(`   Products with images: ${productsWithImagesCount}`);
    console.log(`   Sampled products with images: ${productsWithImages} / ${sampleProducts.length}`);

  } catch (error) {
    console.error("\n❌ Verification failed:", error);
    await disconnectDatabase();
    process.exit(1);
  } finally {
    await disconnectDatabase();
    console.log("\n✅ Disconnected from MongoDB");
  }
}

verifyProducts().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});

