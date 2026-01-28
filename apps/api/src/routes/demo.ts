import { Router, Request, Response, NextFunction } from "express";
import { config } from "../config";
import { getDemoProductsMetadata, getDemoProductsCatalog } from "@repo/core";

const router = Router();

// GET /api/demo/status
router.get("/status", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (config.importMode !== "demo") {
      return res.json({
        mode: "real",
        filePath: null,
        loaded: false,
        totalProducts: 0,
        stores: [],
        categories: [],
      });
    }

    const metadata = await getDemoProductsMetadata(config.localProductsJsonPath);

    res.json({
      mode: "demo",
      filePath: config.localProductsJsonPath,
      loaded: metadata.loaded,
      totalProducts: metadata.totalProducts,
      stores: metadata.stores,
      categories: metadata.categories,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/demo/catalog
router.get("/catalog", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (config.importMode !== "demo") {
      return res.json({
        mode: "real",
        filePath: null,
        totals: { products: 0 },
        stores: {},
      });
    }

    const catalog = await getDemoProductsCatalog(config.localProductsJsonPath);

    res.json(catalog);
  } catch (error) {
    next(error);
  }
});

export default router;

