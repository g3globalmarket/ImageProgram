/**
 * Tests for search query utilities
 * Run with: pnpm test (if test runner configured) or manual verification
 */

import { shortenKoreanProductTitle, buildImageSearchQuery, normalizeWhitespace } from "./searchQuery";

// Manual test cases (can be run with ts-node or similar)
export function runTests() {
  const tests = [
    {
      name: "Remove promo suffix: 더블 기획",
      input: "메디힐 마데카소사이드 흔적 리페어 세럼 40ml+40ml 더블 기획",
      expected: "메디힐 마데카소사이드 흔적 리페어 세럼 40ml",
    },
    {
      name: "Remove bracketed promo",
      input: "브랜드 [증정] 제품명 30ml 기획",
      expected: "브랜드",
    },
    {
      name: "Normalize volume: 40ml+40ml",
      input: "제품명 40ml+40ml 더블",
      expected: "제품명 40ml",
    },
    {
      name: "Normalize volume: 40ml x 2",
      input: "제품명 40ml x 2",
      expected: "제품명 40ml",
    },
    {
      name: "Normalize volume: 40ml*2",
      input: "제품명 40ml*2",
      expected: "제품명 40ml",
    },
    {
      name: "Keep core name + size",
      input: "메디힐 마데카소사이드 세럼 40ml",
      expected: "메디힐 마데카소사이드 세럼 40ml",
    },
    {
      name: "Remove multiple promo tokens",
      input: "제품명 30ml 세트 구성",
      expected: "제품명 30ml",
    },
    {
      name: "Normalize whitespace",
      input: "제품명   30ml   더블",
      expected: "제품명 30ml",
    },
  ];

  console.log("Running searchQuery tests...\n");
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = shortenKoreanProductTitle(test.input);
    const success = result === test.expected;
    
    if (success) {
      console.log(`✓ ${test.name}`);
      passed++;
    } else {
      console.error(`✗ ${test.name}`);
      console.error(`  Input:    "${test.input}"`);
      console.error(`  Expected: "${test.expected}"`);
      console.error(`  Got:      "${result}"`);
      failed++;
    }
  }

  // Test buildImageSearchQuery
  console.log("\nTesting buildImageSearchQuery...\n");
  const queryTest1 = buildImageSearchQuery({
    title: "메디힐 마데카소사이드 세럼 40ml+40ml 더블 기획",
    brand: "메디힐",
  });
  console.log(`Query with brand: "${queryTest1}"`);
  if (queryTest1.includes("더블") || queryTest1.includes("기획")) {
    console.error("✗ Query should not contain promo tokens");
    failed++;
  } else {
    console.log("✓ Query correctly removes promo tokens");
    passed++;
  }

  const queryTest2 = buildImageSearchQuery({
    title: "제품명 30ml",
  });
  console.log(`Query without brand: "${queryTest2}"`);
  if (queryTest2 === "제품명 30ml") {
    console.log("✓ Query works without brand");
    passed++;
  } else {
    console.error("✗ Query should work without brand");
    failed++;
  }

  console.log(`\nTests: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// Export for potential test runner integration
if (require.main === module) {
  runTests();
}

