import { Router, Request, Response, NextFunction } from "express";
import { Product } from "../models/Product";
import { ImportRun } from "../models/ImportRun";

const router = Router();

// POST /api/admin/cleanup/stub
router.post("/stub", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only allow in non-production
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({
        error: {
          message: "Cleanup endpoint is disabled in production",
        },
      });
    }

    // Check admin token
    const adminToken = req.headers["x-admin-token"];
    const expectedToken = process.env.ADMIN_TOKEN;

    if (!expectedToken) {
      return res.status(500).json({
        error: {
          message: "ADMIN_TOKEN not configured",
        },
      });
    }

    if (adminToken !== expectedToken) {
      return res.status(401).json({
        error: {
          message: "Invalid admin token",
        },
      });
    }

    // Check dryRun query param
    const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";

    // Product filter: stub/fake products
    const productFilter = {
      $or: [
        { sourceUrl: /example\.com/i },
        { sourceUrl: /^fake[:/]/i },
        { categoryKey: /^placeholder_/i },
        { notes: /stub/i },
      ],
    };

    // ImportRun filter: stub imports
    const importRunFilter = {
      $or: [
        { categoryUrl: /example\.com/i },
        { categoryKey: /^placeholder_/i },
      ],
    };

    // Count matches
    const productsMatched = await Product.countDocuments(productFilter);
    const importRunsMatched = await ImportRun.countDocuments(importRunFilter);

    let productsDeleted = 0;
    let importRunsDeleted = 0;

    if (!dryRun) {
      // Perform deletions
      const productResult = await Product.deleteMany(productFilter);
      productsDeleted = productResult.deletedCount || 0;

      const importRunResult = await ImportRun.deleteMany(importRunFilter);
      importRunsDeleted = importRunResult.deletedCount || 0;
    }

    res.json({
      dryRun,
      productsMatched,
      importRunsMatched,
      productsDeleted,
      importRunsDeleted,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

