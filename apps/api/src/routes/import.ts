import { Router, Request, Response, NextFunction } from "express";
import {
  ImportRunRequestSchema,
  STORE_CATALOG,
  isTopCategoryAllowed,
  isSubCategoryAllowed,
} from "@repo/shared";
import { isScraperSupported } from "@repo/core";
import { validate } from "../middleware/validate";
import { config } from "../config";
import { runImportService } from "../services/runImportService";

const router = Router();

// POST /api/import/run (synchronous)
router.post(
  "/run",
  validate(ImportRunRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = req.body;

      // Validate store exists in catalog
      const storeCatalog = STORE_CATALOG[params.store as keyof typeof STORE_CATALOG];
      if (!storeCatalog) {
        return res.status(400).json({
          error: {
            message: `Store '${params.store}' not found in catalog`,
            allowedStores: Object.keys(STORE_CATALOG),
          },
        });
      }

      // Check if scraper is supported (prevent fake data)
      if (!isScraperSupported(params.store)) {
        return res.status(501).json({
          error: {
            message: "Scraper for this store is not implemented yet. Import disabled to avoid fake data.",
          },
        });
      }

      // Validate category exists in store
      const category = storeCatalog.categories.find(
        (cat) => cat.key === params.categoryKey
      );
      if (!category) {
        return res.status(400).json({
          error: {
            message: `Category '${params.categoryKey}' not found for store '${params.store}'`,
            allowedCategories: storeCatalog.categories.map((cat) => ({
              key: cat.key,
              label: cat.label,
            })),
          },
        });
      }

      // Validate category against store rules
      if (!isTopCategoryAllowed(params.store, category.topCategory)) {
        return res.status(400).json({
          error: {
            message: `Top category '${category.topCategory}' is not allowed for store '${params.store}'`,
            allowedTopCategories: storeCatalog.categories
              .map((cat) => cat.topCategory)
              .filter((top, index, arr) => arr.indexOf(top) === index),
          },
        });
      }

      if (
        category.subCategory &&
        !isSubCategoryAllowed(
          params.store,
          category.topCategory,
          category.subCategory
        )
      ) {
        return res.status(400).json({
          error: {
            message: `Sub category '${category.subCategory}' is not allowed for store '${params.store}' in top category '${category.topCategory}'`,
          },
        });
      }

      // Run import service
      const result = await runImportService({
        request: params,
        envConfig: config,
      });

      res.json({
        runId: result.runId,
        ...result.stats,
        ...(result.staged ? { staged: result.staged } : {}),
        ...(result.demo ? { demo: result.demo } : {}),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

