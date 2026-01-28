import type { ImageProvider } from "../interfaces";
import type { RawProduct, ImageProviderConfig } from "../types";

export class GoogleCustomSearchImageProvider implements ImageProvider {
  constructor(
    private apiKey: string,
    private searchEngineId: string,
    private debug: boolean = false
  ) {}

  async searchOrGenerateImages(
    product: RawProduct,
    config: ImageProviderConfig
  ): Promise<string[]> {
    if (config.imageMode === "none") {
      return [];
    }

    if (this.debug) {
      console.debug(
        `[GoogleCustomSearch] Searching images for: ${product.title}`
      );
    }

    try {
      // Build search query from product title
      const query = this.buildQuery(product);

      const url = new URL("https://www.googleapis.com/customsearch/v1");
      url.searchParams.set("key", this.apiKey);
      url.searchParams.set("cx", this.searchEngineId);
      url.searchParams.set("q", query);
      url.searchParams.set("searchType", "image");
      url.searchParams.set("num", "3");
      url.searchParams.set("safe", "active");

      const response = await fetch(url.toString());

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Google Custom Search API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = (await response.json()) as {
        error?: unknown;
        items?: Array<{ link?: string }>;
      };

      if (data.error) {
        throw new Error(
          `Google Custom Search API error: ${JSON.stringify(data.error)}`
        );
      }

      if (!data.items || data.items.length === 0) {
        if (this.debug) {
          console.debug(`[GoogleCustomSearch] No images found for: ${product.title}`);
        }
        return [];
      }

      // Extract image URLs
      const imageUrls = data.items
        .map((item) => item.link)
        .filter((url): url is string => Boolean(url));

      if (this.debug) {
        console.debug(
          `[GoogleCustomSearch] Found ${imageUrls.length} images for: ${product.title}`
        );
      }

      return imageUrls;
    } catch (error) {
      if (this.debug) {
        console.debug(`[GoogleCustomSearch] Error:`, error);
      }
      throw error;
    }
  }

  private buildQuery(product: RawProduct): string {
    // Simple query: product title + store name (optional)
    let query = product.title.trim();

    // Remove common Korean characters that might not help search
    // Keep it simple - just use the title
    if (query.length > 100) {
      query = query.substring(0, 100);
    }

    return query;
  }
}

