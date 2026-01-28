/**
 * Test script for AI title cleaner
 * Run with: pnpm tsx scripts/testTitleCleaner.ts
 * Or: node -r ts-node/register scripts/testTitleCleaner.ts
 */

import { cleanImageSearchQuery } from "../apps/api/src/services/titleCleanerAI";

const testTitles = [
  {
    title: "메디힐 마데카소사이드 흔적 리페어 세럼 40ml+40ml 더블 기획",
    brand: "메디힐",
    store: "oliveyoung",
  },
  {
    title: "브랜드 [증정] 제품명 30ml 기획",
    brand: "브랜드",
    store: "oliveyoung",
  },
  {
    title: "제품명 40ml x 2",
    brand: undefined,
    store: "gmarket",
  },
  {
    title: "세트 구성 제품 50ml 1+1",
    brand: "브랜드",
    store: undefined,
  },
  {
    title: "간단한 제품명",
    brand: undefined,
    store: undefined,
  },
];

async function runTests() {
  console.log("Testing AI Title Cleaner\n");
  console.log("=".repeat(60));

  for (let i = 0; i < testTitles.length; i++) {
    const test = testTitles[i];
    console.log(`\nTest ${i + 1}:`);
    console.log(`  Input:  "${test.title}"`);
    if (test.brand) console.log(`  Brand:  "${test.brand}"`);
    if (test.store) console.log(`  Store:  "${test.store}"`);

    try {
      const result = await cleanImageSearchQuery({
        title: test.title,
        brand: test.brand,
        store: test.store,
      });

      console.log(`  Output: "${result.query}"`);
      console.log(`  Method: ${result.method}`);
      if (result.reason) {
        console.log(`  Reason: ${result.reason}`);
      }
    } catch (error) {
      console.error(`  Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Tests completed");
}

// Run if executed directly
if (require.main === module) {
  runTests().catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
  });
}

export { runTests };

