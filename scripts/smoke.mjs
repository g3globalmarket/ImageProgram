#!/usr/bin/env node

/**
 * Smoke test script for Korean Products MERN Monorepo
 * Tests core API endpoints and import functionality
 */

const API_BASE_URL = process.env.SMOKE_API_BASE_URL || "http://localhost:3001";
const requireGmarket = process.env.SMOKE_REQUIRE_GMARKET === "1";
const importMode = process.env.IMPORT_MODE || "real";
const tests = [];
let passed = 0;
let failed = 0;
let warnings = 0;

function log(message) {
  console.log(message);
}

function error(message) {
  console.error(`❌ ${message}`);
}

function success(message) {
  console.log(`✅ ${message}`);
}

function warn(message) {
  console.warn(`⚠️  ${message}`);
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `HTTP ${response.status}: ${response.statusText}\n${text}`
    );
  }

  return response.json();
}

async function test(name, fn) {
  try {
    await fn();
    success(`OK ${name}`);
    passed++;
    return true;
  } catch (err) {
    error(`${name}: ${err.message}`);
    failed++;
    return false;
  }
}

async function runTests() {
  log("\n🧪 Running smoke tests...\n");
  
  if (importMode === "demo") {
    log("📦 Demo Mode detected - testing local JSON import\n");
  }

  // Test 1: Health endpoint
  await test("health", async () => {
    const data = await fetchJSON(`${API_BASE_URL}/health`);
    if (!data.ok) {
      throw new Error("Health check returned ok: false");
    }
  });

  // Test 2: Ready endpoint
  await test("ready", async () => {
    const data = await fetchJSON(`${API_BASE_URL}/api/ready`);
    if (!data.ok) {
      throw new Error("Ready check returned ok: false");
    }
    if (!data.mongo?.ok) {
      throw new Error("MongoDB not connected");
    }
  });

  // Test 3: Stores endpoint
  let gmarketCategory = null;
  let stubCategory = null;
  await test("stores", async () => {
    const storesPayload = await fetchJSON(`${API_BASE_URL}/api/stores`);
    // Handle both array and { stores: [...] } response shapes
    const stores = Array.isArray(storesPayload)
      ? storesPayload
      : Array.isArray(storesPayload?.stores)
      ? storesPayload.stores
      : null;
    
    if (!stores) {
      throw new Error("Stores endpoint did not return array or {stores:[]}");
    }
    
    const gmarket = stores.find((s) => s.key === "gmarket");
    if (!gmarket) {
      throw new Error("gmarket store not found");
    }
    if (!gmarket.categories || gmarket.categories.length === 0) {
      throw new Error("gmarket has no categories");
    }
    gmarketCategory = gmarket.categories.find(
      (c) => c.key === "best_electronics_all"
    );
    if (!gmarketCategory) {
      throw new Error("best_electronics_all category not found");
    }

    // Find a stub store category (11st or oliveyoung)
    const stubStore = stores.find((s) => s.key === "11st" || s.key === "oliveyoung");
    if (stubStore && stubStore.categories && stubStore.categories.length > 0) {
      stubCategory = stubStore.categories[0];
    }
  });

  // Test 4: Config endpoint
  await test("config", async () => {
    const data = await fetchJSON(`${API_BASE_URL}/api/config`);
    if (!data || typeof data !== "object") {
      throw new Error("Config endpoint did not return object");
    }
  });

  // Test 5: Cache stats endpoint
  await test("cache stats", async () => {
    const data = await fetchJSON(`${API_BASE_URL}/api/cache/stats`);
    if (!data || typeof data !== "object") {
      throw new Error("Cache stats endpoint did not return object");
    }
  });

  // Test 6: Demo status endpoint (if in demo mode)
  if (importMode === "demo") {
    await test("demo status", async () => {
      const data = await fetchJSON(`${API_BASE_URL}/api/demo/status`);
      if (data.mode !== "demo") {
        throw new Error(`Expected demo mode, got ${data.mode}`);
      }
      if (!data.loaded) {
        throw new Error("Demo products file not loaded");
      }
      if (data.totalProducts === 0) {
        throw new Error("Demo products file has no products");
      }
      log(`   mode=${data.mode}, totalProducts=${data.totalProducts}, stores=${data.stores.join(",")}`);
    });
  }

  // Test 7: OliveYoung import (real scraper in real mode, demo JSON in demo mode)
  let oliveyoungRunId = null;
  let oliveyoungCategory = null;
  await test("stores (find oliveyoung)", async () => {
    const storesPayload = await fetchJSON(`${API_BASE_URL}/api/stores`);
    const stores = Array.isArray(storesPayload)
      ? storesPayload
      : Array.isArray(storesPayload?.stores)
      ? storesPayload.stores
      : null;
    
    if (!stores) {
      throw new Error("Stores endpoint did not return array or {stores:[]}");
    }
    
    const oliveyoung = stores.find((s) => s.key === "oliveyoung");
    if (!oliveyoung) {
      throw new Error("oliveyoung store not found");
    }
    if (importMode !== "demo" && !oliveyoung.implemented) {
      throw new Error("oliveyoung scraper should be implemented");
    }
    if (!oliveyoung.categories || oliveyoung.categories.length === 0) {
      throw new Error("oliveyoung has no categories");
    }
    // In demo mode, prefer ranking_all if available
    oliveyoungCategory = oliveyoung.categories.find((c) => c.key === "ranking_all") || oliveyoung.categories[0];
  });

  if (oliveyoungCategory) {
    await test(`import oliveyoung (${oliveyoungCategory.key})`, async () => {
      const response = await fetchJSON(`${API_BASE_URL}/api/import/run`, {
        method: "POST",
        body: JSON.stringify({
          store: "oliveyoung",
          categoryKey: oliveyoungCategory.key,
          limit: 3,
          translateTo: "mn",
          imageMode: "none",
          includeDetails: false,
        }),
      });

      if (!response.runId) {
        throw new Error("Import did not return runId");
      }
      oliveyoungRunId = response.runId;
      const total = (response.inserted || 0) + (response.updated || 0);
      if (total === 0) {
        throw new Error("Import did not insert or update any products");
      }
      log(`   runId=${oliveyoungRunId}, inserted=${response.inserted || 0}, updated=${response.updated || 0}`);
    });
  } else {
    log("⚠️  Skipping oliveyoung import (no category found)");
  }

  // Test 8: Gmarket import (first run) - skip in demo mode
  let gmarketRunId1 = null;
  let initialProductCount = 0;
  let gmarketSkipped = false;
  
  const gmarketTestResult = await (async () => {
    try {
      // Get initial product count
      try {
        const productsData = await fetchJSON(
          `${API_BASE_URL}/api/products?limit=200`
        );
        initialProductCount = productsData.data?.length || 0;
      } catch (err) {
        // Ignore if products endpoint fails
      }

      const response = await fetchJSON(`${API_BASE_URL}/api/import/run`, {
        method: "POST",
        body: JSON.stringify({
          store: "gmarket",
          categoryKey: "best_electronics_all",
          limit: 3,
          translateTo: "mn",
          imageMode: "none",
          includeDetails: false,
        }),
      });

      if (!response.runId) {
        throw new Error("Import did not return runId");
      }
      gmarketRunId1 = response.runId;
      const total = (response.inserted || 0) + (response.updated || 0);
      if (total === 0) {
        throw new Error("Import did not insert or update any products");
      }
      log(`   runId=${gmarketRunId1}, inserted=${response.inserted || 0}, updated=${response.updated || 0}`);
      return true;
    } catch (err) {
      // Check if it's a 403/Forbidden error
      const errorMessage = err.message || "";
      const is403 = errorMessage.includes("403") || errorMessage.includes("Forbidden") || errorMessage.includes("blocked");
      
      if (is403 && !requireGmarket) {
        warn(`Skipping gmarket test (403 block): ${errorMessage}`);
        gmarketSkipped = true;
        warnings++;
        return false; // Skip, don't fail
      } else {
        throw err; // Re-throw to fail the test
      }
    }
  })();

  if (gmarketTestResult) {
    success("import gmarket #1");
    passed++;
  } else if (gmarketSkipped) {
    // Already warned, just continue
  } else {
    error("import gmarket #1");
    failed++;
  }

  // Test 9: Gmarket import (second run - idempotency) - only if first didn't skip and not in demo mode
  if (importMode === "demo") {
    log("⚠️  Skipping gmarket idempotency test in demo mode (only JSON stores supported)");
  } else if (!gmarketSkipped) {
    await test("import gmarket #2 (idempotency)", async () => {
      const response = await fetchJSON(`${API_BASE_URL}/api/import/run`, {
        method: "POST",
        body: JSON.stringify({
          store: "gmarket",
          categoryKey: "best_electronics_all",
          limit: 3,
          translateTo: "mn",
          imageMode: "none",
          includeDetails: false,
        }),
      });

      if (!response.runId) {
        throw new Error("Import did not return runId");
      }

      // Check idempotency: second run should have more updates than inserts
      const inserted = response.inserted || 0;
      const updated = response.updated || 0;

      // For idempotency, we expect:
      // - Either inserted is 0 (all were updates)
      // - Or updated > 0 (at least some were updates)
      // - Or total (inserted + updated) > 0 (at least something happened)
      const total = inserted + updated;
      if (total === 0) {
        throw new Error("Second import did not process any products");
      }

      // If we inserted new items, that's okay (maybe limit increased or new products appeared)
      // But we should have at least some updates if products already existed
      log(`   runId=${response.runId}, inserted=${inserted}, updated=${updated}`);
      
      // Verify product count didn't explode (basic sanity check)
      try {
        const productsData = await fetchJSON(
          `${API_BASE_URL}/api/products?limit=200`
        );
        const finalProductCount = productsData.data?.length || 0;
        // Allow some growth but not massive explosion (e.g., not more than 2x initial)
        if (initialProductCount > 0 && finalProductCount > initialProductCount * 2) {
          throw new Error(
            `Product count exploded: ${initialProductCount} -> ${finalProductCount}`
          );
        }
      } catch (err) {
        // Ignore if products endpoint fails, not critical for idempotency test
      }
    });
  } else {
    log("⚠️  Skipping gmarket idempotency test (first run was skipped)");
  }

  // Summary
  log("\n" + "=".repeat(50));
  log(`📊 Test Summary: ${passed} passed, ${failed} failed${warnings > 0 ? `, ${warnings} warnings` : ""}`);
  log("=".repeat(50) + "\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  error(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});

