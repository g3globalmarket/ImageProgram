/**
 * Staged Products API routes
 */

import { Router, Request, Response, NextFunction } from "express";
import { StagedProduct } from "../models/StagedProduct";
import { Product } from "../models/Product";
import { toProductDTO } from "../dto/productDto";

const router = Router();

/**
 * GET /api/staged-products
 * List staged products with filtering
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { store, status = "staged", page = "1", limit = "20" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(Math.max(1, parseInt(limit as string, 10)), 100);
    const skip = (pageNum - 1) * limitNum;

    const query: any = {};
    if (store) {
      query.store = store;
    }
    if (status) {
      query.status = status;
    }

    const [data, total] = await Promise.all([
      StagedProduct.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean()
        .exec(),
      StagedProduct.countDocuments(query),
    ]);

    res.json({
      data: data.map((sp) => ({
        id: sp._id.toString(),
        store: sp.store,
        categoryKey: sp.categoryKey,
        topCategory: sp.topCategory,
        subCategory: sp.subCategory,
        sourceUrl: sp.sourceUrl,
        externalId: sp.externalId,
        titleKo: sp.titleKo,
        titleMn: sp.titleMn,
        price: sp.price,
        currency: sp.currency,
        imagesOriginal: sp.imagesOriginal || [],
        imagesProcessed: sp.imagesProcessed || [],
        descriptionOriginal: sp.descriptionOriginal || "",
        descriptionTranslated: sp.descriptionTranslated || "",
        status: sp.status,
        importRunId: sp.importRunId,
        createdAt: sp.createdAt,
        updatedAt: sp.updatedAt,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/staged-products/:id
 * Get single staged product
 */
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stagedProduct = await StagedProduct.findById(req.params.id);

    if (!stagedProduct) {
      return res.status(404).json({
        error: {
          message: "Staged product not found",
        },
      });
    }

    res.json({
      id: stagedProduct._id.toString(),
      store: stagedProduct.store,
      categoryKey: stagedProduct.categoryKey,
      topCategory: stagedProduct.topCategory,
      subCategory: stagedProduct.subCategory,
      sourceUrl: stagedProduct.sourceUrl,
      externalId: stagedProduct.externalId,
      titleKo: stagedProduct.titleKo,
      titleMn: stagedProduct.titleMn,
      price: stagedProduct.price,
      currency: stagedProduct.currency,
      imagesOriginal: stagedProduct.imagesOriginal || [],
      imagesProcessed: stagedProduct.imagesProcessed || [],
      descriptionOriginal: stagedProduct.descriptionOriginal || "",
      descriptionTranslated: stagedProduct.descriptionTranslated || "",
      status: stagedProduct.status,
      importRunId: stagedProduct.importRunId,
      createdAt: stagedProduct.createdAt,
      updatedAt: stagedProduct.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/staged-products/:id/publish
 * Publish staged product to Products collection
 */
router.post("/:id/publish", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stagedProduct = await StagedProduct.findById(req.params.id);

    if (!stagedProduct) {
      return res.status(404).json({
        error: {
          message: "Staged product not found",
        },
      });
    }

    if (stagedProduct.status === "published") {
      return res.status(400).json({
        error: {
          message: "Product is already published",
        },
      });
    }

    // Create/update Product from StagedProduct
    const productData = {
      store: stagedProduct.store as any,
      categoryKey: stagedProduct.categoryKey,
      sourceUrl: stagedProduct.sourceUrl,
      title: stagedProduct.titleKo, // Use Korean title as main title
      titleMn: stagedProduct.titleMn, // Mongolian translation
      price: stagedProduct.price,
      currency: stagedProduct.currency,
      imagesOriginal: stagedProduct.imagesOriginal || [],
      imagesProcessed: stagedProduct.imagesProcessed || [],
      descriptionOriginal: stagedProduct.descriptionOriginal || "",
      descriptionTranslated: stagedProduct.descriptionTranslated || "",
      langOriginal: "ko",
      langTranslated: "mn",
      status: "imported" as const,
      notes: `Published from staged import (runId: ${stagedProduct.importRunId})`,
      lockedFields: [],
    };

    // Upsert into Products collection
    const product = await Product.findOneAndUpdate(
      {
        store: stagedProduct.store,
        sourceUrl: stagedProduct.sourceUrl,
      },
      {
        $set: productData,
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
      }
    );

    // Mark staged product as published
    stagedProduct.status = "published";
    await stagedProduct.save();

    const productDTO = toProductDTO(product);

    res.json({
      product: productDTO,
      message: "Product published successfully",
    });
  } catch (error) {
    next(error);
  }
});

export default router;

