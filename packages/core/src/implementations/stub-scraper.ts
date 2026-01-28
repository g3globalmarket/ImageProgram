import type { Scraper } from "../interfaces";
import type { RawProduct, ScraperConfig } from "../types";

export class StubScraper implements Scraper {
  async fetchProducts(config: ScraperConfig): Promise<RawProduct[]> {
    const products: RawProduct[] = [];

    for (let i = 1; i <= config.limit; i++) {
      products.push({
        store: config.store,
        categoryKey: config.categoryKey,
        sourceUrl: config.categoryUrl
          ? `${config.categoryUrl}&itemNo=${i}`
          : `https://${config.store}.com/product/${i}`,
        title: `${config.store} 제품 ${i} - 한국어 제목`,
        price: Math.floor(Math.random() * 100000) + 10000,
        currency: "KRW",
        imagesOriginal: [
          `https://example.com/images/${config.store}/product-${i}-1.jpg`,
          `https://example.com/images/${config.store}/product-${i}-2.jpg`,
        ],
        descriptionOriginal: `이것은 ${config.store}에서 가져온 제품 ${i}의 한국어 설명입니다. 고품질의 제품으로 많은 고객들이 만족하고 있습니다.`,
        langOriginal: "ko",
      });
    }

    return products;
  }
}

