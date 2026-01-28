/**
 * Backfill script to translate titleMn for existing products missing it
 */

import mongoose from "mongoose";
import { Product } from "../apps/api/src/models/Product";
import { translateTitleToMn } from "../apps/api/src/services/titleMnTranslatorAI";
import { config } from "../apps/api/src/config";
import { createLimiter } from "../apps/api/src/utils/limitConcurrency";

async function connectDatabase() {
  const uri = config.mongodbUri;
  await mongoose.connect(uri);
  console.log("✅ Connected to MongoDB");
}

async function disconnectDatabase() {
  await mongoose.disconnect();
  console.log("✅ Disconnected from MongoDB");
}

async function backfillTitleMn() {
  await connectDatabase();

  try {
    // Find products where titleMn is missing or empty
    const products = await Product.find({
      $or: [
        { titleMn: { $exists: false } },
        { titleMn: null },
        { titleMn: "" },
      ],
    })
      .select("_id title store titleMn")
      .lean();

    console.log(`\nFound ${products.length} products missing titleMn\n`);

    if (products.length === 0) {
      console.log("✅ No products need translation");
      await disconnectDatabase();
      return;
    }

    if (!config.autoTranslateTitleMn) {
      console.log("⚠️  AUTO_TRANSLATE_TITLE_MN is disabled. Set it to true to enable translation.");
      await disconnectDatabase();
      return;
    }

    if (!config.geminiApiKey) {
      console.log("⚠️  GEMINI_API_KEY is missing. Cannot translate titles.");
      await disconnectDatabase();
      return;
    }

    // Use concurrency limiter from config (respects AI_TRANSLATOR_CONCURRENCY)
    const limit = createLimiter(config.aiTranslatorConcurrency);
    let translated = 0;
    let failed = 0;
    const errors: string[] = [];

    const translatePromises = products.map((product) =>
      limit(async () => {
        try {
          const result = await translateTitleToMn({
            titleKo: product.title,
            store: product.store,
          });

          // Update product
          await Product.updateOne(
            { _id: product._id },
            { $set: { titleMn: result.titleMn } }
          );

          translated++;
          if (translated % 10 === 0) {
            console.log(`  Translated ${translated}/${products.length}...`);
          }
        } catch (err) {
          failed++;
          const errorMsg = `Product ${product._id}: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(errorMsg);
          console.warn(`  ❌ ${errorMsg}`);
        }
      })
    );

    await Promise.all(translatePromises);

    console.log(`\n✅ Backfill completed!`);
    console.log(`   Translated: ${translated}`);
    console.log(`   Failed: ${failed}`);

    if (errors.length > 0 && errors.length <= 10) {
      console.log(`\n⚠️  Errors:`);
      errors.forEach((err) => console.log(`   - ${err}`));
    } else if (errors.length > 10) {
      console.log(`\n⚠️  ${errors.length} errors occurred (showing first 10):`);
      errors.slice(0, 10).forEach((err) => console.log(`   - ${err}`));
    }
  } catch (error) {
    console.error("❌ Backfill failed:", error);
    throw error;
  } finally {
    await disconnectDatabase();
  }
}

backfillTitleMn().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});

