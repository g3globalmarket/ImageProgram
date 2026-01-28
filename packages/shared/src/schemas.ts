import { z } from "zod";
import type { Store, ImageMode, ProductStatus, LockableProductField } from "./types";
import { LOCKABLE_PRODUCT_FIELDS } from "./types";

export const StoreSchema = z.enum(["gmarket", "11st", "oliveyoung"]);

export const ImageModeSchema = z.enum(["none", "search", "generate"]);

export const ProductStatusSchema = z.enum([
  "imported",
  "translated",
  "images_updated",
  "ready",
  "error",
]);

export const ImportRunRequestSchema = z.object({
  store: StoreSchema,
  categoryKey: z.string().min(1),
  limit: z.number().int().positive().max(1000),
  translateTo: z.string().length(2),
  imageMode: ImageModeSchema,
  includeDetails: z.boolean().optional().default(false),
});

export const PatchProductSchema = z.object({
  title: z.string().optional(),
  price: z.number().nonnegative().optional(), // Allow 0
  descriptionTranslated: z.string().optional(),
  imagesProcessed: z.array(z.string().url()).optional(),
  status: ProductStatusSchema.optional(),
  notes: z.string().optional(),
  lockFields: z.array(z.enum(LOCKABLE_PRODUCT_FIELDS as unknown as [string, ...string[]])).optional(),
  unlockFields: z.array(z.enum(LOCKABLE_PRODUCT_FIELDS as unknown as [string, ...string[]])).optional(),
  brandEn: z.string().max(200).optional(),
  modelEn: z.string().max(500).optional(),
  titleMn: z.string().max(500).optional(),
});

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().optional(),
});

