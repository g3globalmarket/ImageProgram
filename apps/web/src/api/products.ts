import { api } from "./client";
import type {
  ProductDTO,
  PaginatedResponse,
  ImportRunRequest,
  PatchProductRequest,
  StoreCategory,
  ImportRunDTO,
} from "@repo/shared";

export interface StoreCatalogItem {
  key: string;
  label: string;
  categories: StoreCategory[];
  implemented?: boolean;
}

export async function getProducts(params?: {
  page?: number;
  limit?: number;
  sort?: string;
  store?: string;
  categoryKey?: string;
  topCategory?: string;
  subCategory?: string;
}): Promise<PaginatedResponse<ProductDTO>> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", params.page.toString());
  if (params?.limit) query.set("limit", params.limit.toString());
  if (params?.sort) query.set("sort", params.sort);
  if (params?.store) query.set("store", params.store);
  if (params?.categoryKey) query.set("categoryKey", params.categoryKey);
  if (params?.topCategory) query.set("topCategory", params.topCategory);
  if (params?.subCategory) query.set("subCategory", params.subCategory);

  return api.get<PaginatedResponse<ProductDTO>>(
    `/api/products?${query.toString()}`
  );
}

export interface CategoriesResponse {
  store: string;
  topCategories: Array<{
    key: string;
    subCategories: Array<{
      key: string;
      categoryKeys: string[];
    }>;
  }>;
  categoryKeys: string[];
}

export async function getCategories(store: string): Promise<CategoriesResponse> {
  return api.get<CategoriesResponse>(`/api/meta/categories?store=${encodeURIComponent(store)}`);
}

export async function getProduct(id: string): Promise<ProductDTO> {
  return api.get<ProductDTO>(`/api/products/${id}`);
}

export async function patchProduct(
  id: string,
  data: PatchProductRequest
): Promise<ProductDTO> {
  return api.patch<ProductDTO>(`/api/products/${id}`, data);
}

export interface AutofillTitleResponse {
  product: ProductDTO;
  method: "ai" | "fallback";
  reason?: string;
  parsed: {
    brandEn: string;
    modelEn: string;
    titleMn: string;
    searchQuery: string;
  };
}

export async function autofillProductTitle(
  id: string,
  overwrite: boolean = false
): Promise<AutofillTitleResponse> {
  return api.post<AutofillTitleResponse>(`/api/products/${id}/ai/autofill-title`, { overwrite });
}

export async function runImport(
  data: ImportRunRequest
): Promise<{ inserted: number; ids: string[] }> {
  return api.post<{ inserted: number; ids: string[] }>("/api/import/run", data);
}

export interface DemoStatusResponse {
  mode: "demo" | "real";
  filePath: string | null;
  loaded: boolean;
  totalProducts: number;
  stores: string[];
  categories: string[];
}

export async function getDemoStatus(): Promise<DemoStatusResponse> {
  return api.get<DemoStatusResponse>("/api/demo/status");
}

export interface StoreCatalogResponse {
  stores: StoreCatalogItem[];
  taxonomy?: {
    stores: Record<string, {
      allowedTopCategories: string[];
      allowedSubCategories?: Record<string, string[]>;
    }>;
    categories: Record<string, {
      label: string;
      sub: string[];
    }>;
  };
}

export async function getStoresCatalog(): Promise<StoreCatalogResponse> {
  const response = await api.get<StoreCatalogItem[] | StoreCatalogResponse>("/api/stores?format=object");
  // Handle both array and object formats
  if (Array.isArray(response)) {
    return { stores: response };
  }
  return response;
}

export interface ConfigResponse {
  translationProvider: string;
  imageProvider: string;
  hasGoogleApiKey: boolean;
  hasCustomSearchEngineId: boolean;
}

export async function getConfig(): Promise<ConfigResponse> {
  return api.get<ConfigResponse>("/api/config");
}

export async function getImportRuns(params?: {
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<ImportRunDTO>> {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", params.page.toString());
  if (params?.limit) query.set("limit", params.limit.toString());

  return api.get<PaginatedResponse<ImportRunDTO>>(
    `/api/import/runs?${query.toString()}`
  );
}

export async function getImportRun(id: string): Promise<ImportRunDTO> {
  return api.get<ImportRunDTO>(`/api/import/runs/${id}`);
}

export interface EnrichImagesResponse {
  success: boolean;
  downloaded: number;
  finalCount: number;
  skipped: boolean;
  error?: string;
}

export interface EnrichImagesBatchResponse {
  matched: number;
  enriched: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function enrichProductImages(params: {
  productId: string;
  desiredCount?: number;
  force?: boolean;
}): Promise<EnrichImagesResponse> {
  return api.post<EnrichImagesResponse>("/api/images/enrich-one", params);
}

export async function enrichImagesBatch(params: {
  store?: string;
  limit?: number;
  desiredCount?: number;
  force?: boolean;
}): Promise<EnrichImagesBatchResponse> {
  return api.post<EnrichImagesBatchResponse>("/api/images/enrich-batch", params);
}

export interface ImageSuggestion {
  url: string;
  source: "google_cse";
}

export interface SuggestImagesResponse {
  productId: string;
  query: string;
  queryUsed: string; // The actual query used for search
  methodUsed: "ai" | "fallback"; // Method used to clean the query
  countRequested: number;
  suggestions: ImageSuggestion[];
}

export async function suggestImages(
  productId: string,
  count?: number
): Promise<SuggestImagesResponse> {
  const query = new URLSearchParams({ productId });
  if (count) query.set("count", count.toString());
  return api.get<SuggestImagesResponse>(`/api/images/suggest?${query.toString()}`);
}

export interface ApplyImagesResponse {
  downloaded: number;
  failed: number;
  errors?: string[];
  product: ProductDTO;
}

export async function applyImages(
  productId: string,
  urls: string[]
): Promise<ApplyImagesResponse> {
  return api.post<ApplyImagesResponse>("/api/images/apply", { productId, urls });
}

export interface DeleteImageResponse {
  product: ProductDTO;
}

export async function deleteImage(
  productId: string,
  imageUrl: string
): Promise<DeleteImageResponse> {
  return api.post<DeleteImageResponse>("/api/images/delete", { productId, imageUrl });
}

// Staged Products API
export interface StagedProductDTO {
  id: string;
  store: string;
  categoryKey: string;
  topCategory?: string;
  subCategory?: string | null;
  sourceUrl: string;
  externalId?: string;
  titleKo: string;
  titleMn?: string;
  price: number;
  currency: string;
  imagesOriginal: string[];
  imagesProcessed: string[];
  descriptionOriginal?: string;
  descriptionTranslated?: string;
  status: "staged" | "published";
  importRunId: string;
  createdAt: string;
  updatedAt: string;
}

export async function getStagedProducts(params?: {
  store?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<StagedProductDTO>> {
  const query = new URLSearchParams();
  if (params?.store) query.set("store", params.store);
  if (params?.status) query.set("status", params.status);
  if (params?.page) query.set("page", params.page.toString());
  if (params?.limit) query.set("limit", params.limit.toString());

  return api.get<PaginatedResponse<StagedProductDTO>>(
    `/api/staged-products?${query.toString()}`
  );
}

export async function getStagedProduct(id: string): Promise<StagedProductDTO> {
  return api.get<StagedProductDTO>(`/api/staged-products/${id}`);
}

export interface PublishStagedProductResponse {
  product: ProductDTO;
  message: string;
}

export async function publishStagedProduct(
  id: string
): Promise<PublishStagedProductResponse> {
  return api.post<PublishStagedProductResponse>(`/api/staged-products/${id}/publish`);
}

