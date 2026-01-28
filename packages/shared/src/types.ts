export type Store = "gmarket" | "11st" | "oliveyoung";

export type ProductStatus =
  | "imported"
  | "translated"
  | "images_updated"
  | "ready"
  | "error";

export type ImageMode = "none" | "search" | "generate";

export type TranslationProvider = "stub" | "google_api_key";
export type ImageProvider = "stub" | "custom_search";

export const LOCKABLE_PRODUCT_FIELDS = [
  "title",
  "price",
  "descriptionTranslated",
  "imagesProcessed",
  "status",
  "notes",
] as const;

export type LockableProductField = (typeof LOCKABLE_PRODUCT_FIELDS)[number];

export interface ImportRunRequest {
  store: Store;
  categoryKey: string;
  limit: number;
  translateTo: string;
  imageMode: ImageMode;
  includeDetails?: boolean;
}

export interface ProductDTO {
  id: string;
  store: Store;
  categoryKey: string;
  sourceUrl: string;
  title: string;
  price: number;
  currency: string;
  imagesOriginal: string[];
  imagesProcessed: string[];
  descriptionOriginal: string;
  descriptionTranslated: string;
  langOriginal: string;
  langTranslated: string;
  status: ProductStatus;
  notes?: string;
  lockedFields: LockableProductField[];
  brandEn?: string;
  modelEn?: string;
  titleMn?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PatchProductRequest {
  title?: string;
  price?: number;
  descriptionTranslated?: string;
  imagesProcessed?: string[];
  status?: ProductStatus;
  notes?: string;
  lockFields?: LockableProductField[];
  unlockFields?: LockableProductField[];
  brandEn?: string;
  modelEn?: string;
  titleMn?: string;
}

export interface ImportRunDTO {
  id: string;
  store: Store;
  categoryKey: string;
  categoryUrl: string;
  limit: number;
  translateTo: string;
  imageMode: ImageMode;
  translationProvider: TranslationProvider;
  imageProvider: ImageProvider;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  matched: number;
  inserted: number;
  updated: number;
  errorsCount: number;
  createdAt: string;
  updatedAt: string;
}

