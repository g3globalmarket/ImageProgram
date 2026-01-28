/**
 * Google Custom Search API client for image search
 */

import axios from "axios";
import { config } from "../config";

export interface ImageSearchResult {
  link: string;
  title: string;
  displayLink: string;
  mime: string;
  image: {
    contextLink: string;
    height: number;
    width: number;
    byteSize: number;
    thumbnailLink: string;
    thumbnailHeight: number;
    thumbnailWidth: number;
  };
}

export interface ImageSearchResponse {
  items?: ImageSearchResult[];
  searchInformation?: {
    totalResults: string;
    searchTime: number;
  };
  error?: {
    code: number;
    message: string;
  };
}

/**
 * Search for images using Google Custom Search API
 * Supports pagination via `start` parameter (1, 11, 21, etc.)
 */
export async function searchImages(params: {
  query: string;
  num?: number;
  start?: number;
  rights?: string;
}): Promise<string[]> {
  const { query, num = 10, start = 1, rights } = params;

  if (!config.googleCloudApiKey || !config.customSearchEngineId) {
    throw new Error(
      "Google Custom Search API key and CX are required for image search"
    );
  }

  const searchParams = new URLSearchParams({
    key: config.googleCloudApiKey,
    cx: config.customSearchEngineId,
    q: query,
    searchType: "image",
    num: Math.min(num, 10).toString(), // Google API max is 10 per request
    start: start.toString(),
    safe: "active",
    imgSize: "large",
  });

  if (rights) {
    searchParams.set("rights", rights);
  }

  const url = `https://www.googleapis.com/customsearch/v1?${searchParams.toString()}`;

  try {
    const response = await axios.get<ImageSearchResponse>(url, {
      timeout: 10000,
    });

    if (response.data.error) {
      throw new Error(
        `Google Custom Search API error: ${response.data.error.message}`
      );
    }

    if (!response.data.items || response.data.items.length === 0) {
      return [];
    }

    // Extract image URLs - accept any URL from Google Custom Search
    const imageUrls = response.data.items
      .map((item) => item.link)
      .filter((url): url is string => Boolean(url) && (url.startsWith("http://") || url.startsWith("https://")));

    return imageUrls;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        `Image search failed: ${error.response?.status} ${error.response?.statusText}`
      );
    }
    throw error;
  }
}

