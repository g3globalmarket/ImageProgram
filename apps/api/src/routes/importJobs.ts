import { Router, Request, Response, NextFunction } from "express";
import { ImportRunRequestSchema } from "@repo/shared";
import { validate } from "../middleware/validate";
import { enqueueImportJob } from "../queue/importQueue";
import { getImportQueue } from "../queue/importQueue";
import { pingRedis } from "../queue/redis";
import { config } from "../config";
import type { ImportJobPayload } from "../queue/types";

const router = Router();

// POST /api/import/jobs
router.post(
  "/",
  validate(ImportRunRequestSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check if async is enabled and Redis is available
      if (!config.importAsyncEnabled) {
        return res.status(503).json({
          error: "Async import disabled or Redis unavailable",
          hint: "Set REDIS_URL and IMPORT_ASYNC_ENABLED=1 to enable async imports",
        });
      }

      const redisOk = await pingRedis();
      if (!redisOk) {
        return res.status(503).json({
          error: "Async import disabled or Redis unavailable",
          hint: "Set REDIS_URL and IMPORT_ASYNC_ENABLED=1 to enable async imports",
        });
      }

      const payload: ImportJobPayload = {
        request: req.body,
        requestedAt: new Date().toISOString(),
      };

      const { jobId } = await enqueueImportJob(payload);

      res.json({ jobId });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/import/jobs/:jobId
router.get("/:jobId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { jobId } = req.params;
    const queue = getImportQueue();
    const job = await queue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        error: {
          message: "Job not found",
        },
      });
    }

    const state = await job.getState();
    const progress = (job.progress || {}) as any;
    const returnvalue = job.returnvalue;
    const failedReason = job.failedReason;

    const response: any = {
      jobId,
      state,
      progress,
    };

    if (returnvalue) {
      response.result = returnvalue;
    }

    if (failedReason) {
      response.error = failedReason;
    }

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;

