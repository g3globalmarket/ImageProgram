import { Router, Request, Response, NextFunction } from "express";
import { pingRedis } from "../queue/redis";
import { config } from "../config";

const router = Router();

// GET /api/queue/health
router.get("/health", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const redisOk = await pingRedis();

    res.json({
      asyncEnabled: config.importAsyncEnabled,
      redisOk,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

