import { Router, Request, Response, NextFunction } from "express";
import { Product } from "../models/Product";
import { PaginationQuerySchema, PatchProductSchema, LOCKABLE_PRODUCT_FIELDS } from "@repo/shared";
import { validateQuery, validate } from "../middleware/validate";
import type { PaginatedResponse, ProductDTO, LockableProductField } from "@repo/shared";
import { toProductDTO } from "../dto/productDto";
import { translateTitleToMn } from "../services/titleMnTranslatorAI";
import { config } from "../config";

const router = Router();

// GET /api/products
router.get(
  "/",
  validateQuery(PaginationQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page = 1, limit = 20, sort } = req.query;
      const pageNum = Number(page);
      const limitNum = Number(limit);

      const skip = (pageNum - 1) * limitNum;

      let query = Product.find();

      // Filter by store if provided
      if (req.query.store) {
        query = query.where("store").equals(req.query.store);
      }

      // Filter by categoryKey if provided
      if (req.query.categoryKey) {
        query = query.where("categoryKey").equals(req.query.categoryKey);
      }

      // Filter by topCategory if provided
      if (req.query.topCategory) {
        query = query.where("topCategory").equals(req.query.topCategory);
      }

      // Filter by subCategory if provided
      if (req.query.subCategory) {
        query = query.where("subCategory").equals(req.query.subCategory);
      }

      // Basic sort support
      if (sort) {
        const sortField = sort.toString().startsWith("-")
          ? sort.toString().slice(1)
          : sort.toString();
        const sortOrder = sort.toString().startsWith("-") ? -1 : 1;
        query = query.sort({ [sortField]: sortOrder });
      } else {
        query = query.sort({ createdAt: -1 });
      }

      // Build count query with same filters
      let countQuery = Product.find();
      if (req.query.store) {
        countQuery = countQuery.where("store").equals(req.query.store);
      }
      if (req.query.categoryKey) {
        countQuery = countQuery.where("categoryKey").equals(req.query.categoryKey);
      }
      if (req.query.topCategory) {
        countQuery = countQuery.where("topCategory").equals(req.query.topCategory);
      }
      if (req.query.subCategory) {
        countQuery = countQuery.where("subCategory").equals(req.query.subCategory);
      }

      const [data, total] = await Promise.all([
        query.skip(skip).limit(limitNum).exec(),
        countQuery.countDocuments(),
      ]);

      // Log image data for verification (only in development)
      if (process.env.NODE_ENV === "development" && data.length > 0) {
        const sample = data[0];
        console.log(
          `[Products API] Sample product images:`,
          `imagesOriginal: ${sample.imagesOriginal?.length || 0},`,
          `imagesProcessed: ${sample.imagesProcessed?.length || 0}`
        );
      }

      const products: ProductDTO[] = data.map((product) => toProductDTO(product));

      const response: PaginatedResponse<ProductDTO> = {
        data: products,
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

// GET /api/products/:id
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        error: {
          message: "Product not found",
        },
      });
    }

    const productDTO = toProductDTO(product);
    res.json(productDTO);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/products/:id
router.patch(
  "/:id",
  validate(PatchProductSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await Product.findById(req.params.id);

      if (!product) {
        return res.status(404).json({
          error: {
            message: "Product not found",
          },
        });
      }

      const {
        title,
        price,
        descriptionTranslated,
        imagesProcessed,
        status,
        notes,
        lockFields,
        unlockFields,
        brandEn, // kept for backward compatibility, not used in UI
        modelEn, // kept for backward compatibility, not used in UI
        titleMn,
      } = req.body;

      // Track which fields are being edited (for auto-locking)
      const editedFields: LockableProductField[] = [];

      // Apply field updates
      if (title !== undefined) {
        product.title = title;
        editedFields.push("title");
      }
      if (price !== undefined) {
        product.price = price;
        editedFields.push("price");
      }
      if (descriptionTranslated !== undefined) {
        product.descriptionTranslated = descriptionTranslated;
        editedFields.push("descriptionTranslated");
      }
      if (imagesProcessed !== undefined) {
        product.imagesProcessed = imagesProcessed;
        editedFields.push("imagesProcessed");
      }
      if (status !== undefined) {
        product.status = status;
        editedFields.push("status");
      }
      if (notes !== undefined) {
        product.notes = notes;
        editedFields.push("notes");
      }
      if (brandEn !== undefined) {
        product.brandEn = typeof brandEn === "string" ? brandEn.trim() : brandEn;
      }
      if (modelEn !== undefined) {
        product.modelEn = typeof modelEn === "string" ? modelEn.trim() : modelEn;
      }
      if (titleMn !== undefined) {
        product.titleMn = typeof titleMn === "string" ? titleMn.trim() : titleMn;
      } else if (title !== undefined && config.autoTranslateTitleMn) {
        // Auto-translate titleMn if title was updated and titleMn not provided
        // Only translate if titleMn is missing/empty
        if (!product.titleMn || product.titleMn.trim() === "") {
          try {
            const translateResult = await translateTitleToMn({
              titleKo: product.title,
              store: product.store,
            });
            product.titleMn = translateResult.titleMn;
          } catch (err) {
            console.warn(`[PATCH /products/:id] Failed to auto-translate titleMn: ${err}`);
            // Continue without translation
          }
        }
      }

      // Handle locking/unlocking
      const currentLockedFields = new Set(product.lockedFields || []);

      // Unlock fields first (if explicitly requested)
      if (unlockFields && Array.isArray(unlockFields)) {
        unlockFields.forEach((field: LockableProductField) => {
          currentLockedFields.delete(field);
        });
      }

      // Lock fields (explicitly requested or auto-lock edited fields)
      const fieldsToLock = new Set<LockableProductField>();

      // Add explicitly requested locks
      if (lockFields && Array.isArray(lockFields)) {
        lockFields.forEach((field: LockableProductField) => {
          if (LOCKABLE_PRODUCT_FIELDS.includes(field)) {
            fieldsToLock.add(field);
          }
        });
      }

      // Auto-lock edited fields (unless explicitly unlocked in same request)
      editedFields.forEach((field) => {
        if (!unlockFields || !unlockFields.includes(field)) {
          fieldsToLock.add(field);
        }
      });

      // Apply locks
      fieldsToLock.forEach((field) => {
        currentLockedFields.add(field);
      });

      product.lockedFields = Array.from(currentLockedFields);

      await product.save();

      const productDTO = toProductDTO(product);
      res.json(productDTO);
    } catch (error) {
      next(error);
    }
  }
);

export default router;

