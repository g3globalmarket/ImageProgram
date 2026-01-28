import { Router, Request, Response, NextFunction } from "express";
import { config } from "../config";

const router = Router();

// GET /api/config
router.get("/", (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({
      translationProvider: config.translationProvider,
      imageProvider: config.imageProvider,
      hasGoogleApiKey: Boolean(config.googleCloudApiKey),
      hasCustomSearchEngineId: Boolean(config.customSearchEngineId),
    });
  } catch (error) {
    next(error);
  }
});

export default router;

