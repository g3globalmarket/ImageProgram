import { Router, Request, Response, NextFunction } from "express";
import { config } from "../config";
import { loadDemoProducts } from "@repo/core";

const router = Router();

/**
 * GET /api/meta/categories?store=...
 * Returns dynamic categories derived from local JSON file
 */
router.get("/categories", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const store = req.query.store as string | undefined;
    
    if (!store) {
      return res.status(400).json({
        error: {
          message: "store query parameter is required",
        },
      });
    }

    // Load products from local JSON
    const products = await loadDemoProducts(config.localProductsJsonPath);
    
    // Filter by store
    const storeProducts = products.filter((p) => p.store === store);
    
    if (storeProducts.length === 0) {
      return res.json({
        store,
        topCategories: [],
        categoryKeys: [],
      });
    }

    // Build category structure
    const topCategoryMap = new Map<
      string,
      {
        key: string;
        subCategories: Map<
          string,
          {
            key: string;
            categoryKeys: Set<string>;
          }
        >;
      }
    >();

    const categoryKeysSet = new Set<string>();

    for (const product of storeProducts) {
      categoryKeysSet.add(product.categoryKey);

      if (product.topCategory) {
        if (!topCategoryMap.has(product.topCategory)) {
          topCategoryMap.set(product.topCategory, {
            key: product.topCategory,
            subCategories: new Map(),
          });
        }

        const topCat = topCategoryMap.get(product.topCategory)!;

        if (product.subCategory) {
          if (!topCat.subCategories.has(product.subCategory)) {
            topCat.subCategories.set(product.subCategory, {
              key: product.subCategory,
              categoryKeys: new Set(),
            });
          }
          topCat.subCategories.get(product.subCategory)!.categoryKeys.add(product.categoryKey);
        }
      }
    }

    // Convert to response format
    const topCategories = Array.from(topCategoryMap.values())
      .map((topCat) => ({
        key: topCat.key,
        subCategories: Array.from(topCat.subCategories.values())
          .map((subCat) => ({
            key: subCat.key,
            categoryKeys: Array.from(subCat.categoryKeys).sort(),
          }))
          .sort((a, b) => a.key.localeCompare(b.key)),
      }))
      .sort((a, b) => a.key.localeCompare(b.key));

    res.json({
      store,
      topCategories,
      categoryKeys: Array.from(categoryKeysSet).sort(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;

