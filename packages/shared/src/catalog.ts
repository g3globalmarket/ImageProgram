import type { Store } from "./types";
import type { TopCategoryKey, SubCategoryKey } from "./taxonomy";

export type StoreCategory = {
  key: string; // categoryKey
  label: string; // human readable
  url: string; // the real category URL we scrape from
  topCategory: TopCategoryKey;
  subCategory?: SubCategoryKey;
};

export type StoreCatalog = Record<
  Store,
  { label: string; categories: StoreCategory[] }
>;

export const STORE_CATALOG: StoreCatalog = {
  gmarket: {
    label: "Gmarket",
    categories: [
      {
        key: "best_electronics_all",
        label: "BEST - Electronics (All)",
        url: "https://m.gmarket.co.kr/n/best?groupCode=100001007",
        topCategory: "electronics",
      },
      {
        key: "best_electronics_computers",
        label: "BEST - Computers/Notebooks/Monitors",
        url: "https://m.gmarket.co.kr/n/best?groupCode=100001007&subGroupCode=200006016",
        topCategory: "electronics",
        subCategory: "computers_laptops",
      },
      {
        key: "best_electronics_peripherals",
        label: "BEST - PC Peripherals / Printers",
        url: "https://m.gmarket.co.kr/n/best?groupCode=100001007&subGroupCode=200001045",
        topCategory: "electronics",
        subCategory: "accessories",
      },
      {
        key: "best_electronics_phones",
        label: "BEST - Phones / Tablets",
        url: "https://m.gmarket.co.kr/n/best?groupCode=100001007&subGroupCode=200003006",
        topCategory: "electronics",
        subCategory: "phones",
      },
    ],
  },
  "11st": {
    label: "11st",
    categories: [
      {
        key: "placeholder_11st_1",
        label: "Placeholder category",
        url: "https://example.com/11st",
        topCategory: "electronics",
      },
    ],
  },
  oliveyoung: {
    label: "Olive Young",
    categories: [
      {
        key: "ranking_all",
        label: "BEST - Ranking (All)",
        url: "https://www.oliveyoung.co.kr/store/main/getBestList.do?dispCatNo=900000100100001&fltDispCatNo=&pageIdx=1&rowsPerPage=8",
        topCategory: "beauty",
      },
    ],
  },
};

