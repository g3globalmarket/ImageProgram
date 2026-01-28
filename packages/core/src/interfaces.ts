import type {
  RawProduct,
  ProcessedProduct,
  ScraperConfig,
  TranslatorConfig,
  ImageProviderConfig,
} from "./types";

export interface Scraper {
  fetchProducts(config: ScraperConfig): Promise<RawProduct[]>;
}

export interface Translator {
  translate(text: string, config: TranslatorConfig): Promise<string>;
}

export interface ImageProvider {
  searchOrGenerateImages(
    product: RawProduct,
    config: ImageProviderConfig
  ): Promise<string[]>;
}

