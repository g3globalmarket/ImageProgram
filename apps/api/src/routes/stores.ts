import { Router, Request, Response, NextFunction } from "express";
import { STORE_CATALOG, STORE_RULES, CATEGORIES } from "@repo/shared";
import { SCRAPER_SUPPORT } from "@repo/core";

const router = Router();

// GET /api/stores
router.get("/", (req: Request, res: Response, next: NextFunction) => {
  try {
    const stores = Object.entries(STORE_CATALOG).map(([key, value]) => ({
      key,
      label: value.label,
      categories: value.categories,
      implemented: SCRAPER_SUPPORT[key as keyof typeof SCRAPER_SUPPORT] ?? false,
    }));

    // Support both array format (default, for smoke test) and object format (for UI backward compatibility)
    const format = req.query.format as string | undefined;
    if (format === "object") {
      // Return as object with taxonomy for UI compatibility
      res.json({
        stores,
        taxonomy: {
          stores: STORE_RULES,
          categories: CATEGORIES,
        },
      });
    } else {
      // Return as array by default (for smoke test compatibility)
      res.json(stores);
    }
  } catch (error) {
    next(error);
  }
});

export default router;

