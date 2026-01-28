import { Router, Request, Response, NextFunction } from "express";
import { TranslationCacheEntry } from "../models/TranslationCacheEntry";
import { ImageCacheEntry } from "../models/ImageCacheEntry";
import { config } from "../config";

const router = Router();

// GET /api/cache/stats
router.get("/stats", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [translationEntries, imageEntries] = await Promise.all([
      TranslationCacheEntry.countDocuments(),
      ImageCacheEntry.countDocuments(),
    ]);

    res.json({
      cacheEnabled: config.cacheEnabled,
      translationEntries,
      imageEntries,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

