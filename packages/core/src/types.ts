import type { Store, ImageMode, TranslationProvider, ImageProvider } from "@repo/shared";

export interface RawProduct {
  store: Store;
  categoryKey: string;
  sourceUrl: string;
  title: string;
  price: number;
  currency: string;
  imagesOriginal: string[];
  descriptionOriginal: string;
  langOriginal: string;
}

export interface ProcessedProduct extends RawProduct {
  descriptionTranslated: string;
  langTranslated: string;
  imagesProcessed: string[];
  status: "imported" | "translated" | "images_updated" | "ready" | "error";
  notes?: string;
}

export interface ScraperConfig {
  store: Store;
  categoryKey: string;
  categoryUrl: string;
  limit: number;
}

export interface TranslatorConfig {
  from: string;
  to: string;
}

export interface ImageProviderConfig {
  imageMode: ImageMode;
}

export interface PipelineProvidersConfig {
  translationProvider: TranslationProvider;
  imageProvider: ImageProvider;
  googleApiKey?: string;
  customSearchEngineId?: string;
  debugGoogle?: boolean;
}

