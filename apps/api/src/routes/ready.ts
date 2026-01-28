import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { config } from "../config";

const router = Router();

// GET /api/ready
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const mongoOk = mongoose.connection.readyState === 1;

    if (!mongoOk) {
      return res.status(503).json({
        ok: false,
        mongo: { ok: false },
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      ok: true,
      mongo: { ok: true },
      cache: { enabled: config.cacheEnabled },
      providers: {
        translation: config.translationProvider,
        images: config.imageProvider,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;

