import { Router, Request, Response, NextFunction } from "express";
import { ImportRun } from "../models/ImportRun";
import { PaginationQuerySchema } from "@repo/shared";
import { validateQuery } from "../middleware/validate";
import type { PaginatedResponse } from "@repo/shared";

const router = Router();

// GET /api/import/runs
router.get(
  "/",
  validateQuery(PaginationQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const pageNum = Number(page);
      const limitNum = Number(limit);

      const skip = (pageNum - 1) * limitNum;

      const [runs, total] = await Promise.all([
        ImportRun.find()
          .sort({ startedAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean()
          .exec(),
        ImportRun.countDocuments(),
      ]);

      const runsDTO = runs.map((run) => ({
        id: run._id.toString(),
        store: run.store,
        categoryKey: run.categoryKey,
        categoryUrl: run.categoryUrl,
        limit: run.limit,
        translateTo: run.translateTo,
        imageMode: run.imageMode,
        translationProvider: run.translationProvider,
        imageProvider: run.imageProvider,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString(),
        durationMs: run.durationMs,
        matched: run.matched,
        inserted: run.inserted,
        updated: run.updated,
        errorsCount: run.errorsCount,
        includeDetails: run.includeDetails,
        detailErrorsCount: run.detailErrorsCount,
        createdAt: run.createdAt.toISOString(),
        updatedAt: run.updatedAt.toISOString(),
      }));

      const response: PaginatedResponse<typeof runsDTO[0]> = {
        data: runsDTO,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/import/runs/:id
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const run = await ImportRun.findById(req.params.id).lean();

    if (!run) {
      return res.status(404).json({
        error: {
          message: "Import run not found",
        },
      });
    }

    const runDTO = {
      id: run._id.toString(),
      store: run.store,
      categoryKey: run.categoryKey,
      categoryUrl: run.categoryUrl,
      limit: run.limit,
      translateTo: run.translateTo,
      imageMode: run.imageMode,
      translationProvider: run.translationProvider,
      imageProvider: run.imageProvider,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString(),
      durationMs: run.durationMs,
      matched: run.matched,
      inserted: run.inserted,
      updated: run.updated,
      errorsCount: run.errorsCount,
      includeDetails: run.includeDetails,
      detailErrorsCount: run.detailErrorsCount,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    };

    res.json(runDTO);
  } catch (error) {
    next(error);
  }
});

export default router;

