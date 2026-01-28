import type { ProductDTO, LockableProductField } from "@repo/shared";
import type { IProduct } from "../models/Product";

/**
 * Convert a Product document (Mongoose) to ProductDTO
 * Ensures consistent mapping with id field and all required fields
 */
export function toProductDTO(p: IProduct | any): ProductDTO {
  return {
    id: String(p._id || p.id),
    store: p.store,
    categoryKey: p.categoryKey || "",
    sourceUrl: p.sourceUrl || "",
    title: p.title || "",
    price: p.price ?? 0,
    currency: p.currency || "KRW",
    imagesOriginal: Array.isArray(p.imagesOriginal) ? p.imagesOriginal : [],
    imagesProcessed: Array.isArray(p.imagesProcessed) ? p.imagesProcessed : [],
    descriptionOriginal: p.descriptionOriginal || "",
    descriptionTranslated: p.descriptionTranslated || "",
    langOriginal: p.langOriginal || "ko",
    langTranslated: p.langTranslated || "",
    status: p.status || "imported",
    notes: p.notes || undefined,
    lockedFields: Array.isArray(p.lockedFields) ? (p.lockedFields as LockableProductField[]) : [],
    brandEn: p.brandEn || undefined,
    modelEn: p.modelEn || undefined,
    titleMn: p.titleMn || undefined,
    createdAt: p.createdAt ? (p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt)) : new Date().toISOString(),
    updatedAt: p.updatedAt ? (p.updatedAt instanceof Date ? p.updatedAt.toISOString() : String(p.updatedAt)) : new Date().toISOString(),
  };
}

