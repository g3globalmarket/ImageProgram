import type { ImageProvider } from "../interfaces";
import type { RawProduct, ImageProviderConfig } from "../types";

export class StubImageProvider implements ImageProvider {
  async searchOrGenerateImages(
    product: RawProduct,
    config: ImageProviderConfig
  ): Promise<string[]> {
    if (config.imageMode === "none") {
      return [];
    }

    // Return placeholder URLs
    return [
      `https://example.com/processed/${product.store}/product-${product.title.slice(0, 5)}-1.jpg`,
      `https://example.com/processed/${product.store}/product-${product.title.slice(0, 5)}-2.jpg`,
    ];
  }
}

