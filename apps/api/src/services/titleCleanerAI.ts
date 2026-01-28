/**
 * AI-based title cleaning service using Gemini API
 * Cleans Korean e-commerce product titles for better image search queries
 */

import axios, { AxiosError } from "axios";
import { config } from "../config";
import { withRetry } from "../utils/withRetry";
import { createLimiter } from "../utils/limitConcurrency";

export type CleanResult = {
  query: string;
  method: "ai" | "fallback";
  rawTitle: string;
  reason?: string;
};

// In-memory cache for cleaned queries
const cache = new Map<string, CleanResult>();
const CACHE_MAX_SIZE = config.aiTitleCleaningCacheMax;

// Shared concurrency limiter for Gemini API calls
const limit = createLimiter(config.aiTranslatorConcurrency);

/**
 * Get cache key from input parameters
 */
function getCacheKey(params: { title: string; brand?: string; store?: string }): string {
  const { title, brand, store } = params;
  return `${store || ""}::${brand || ""}::${title}`;
}

/**
 * Trim and collapse whitespace
 */
function normalizeWhitespace(s: string): string {
  if (!s || typeof s !== "string") return "";
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Fallback query builder (simple, safe)
 */
function buildFallbackQuery(params: { title: string; brand?: string }): string {
  const { title, brand } = params;
  if (!title || typeof title !== "string") return "";
  
  const trimmedTitle = normalizeWhitespace(title);
  if (!trimmedTitle) return "";

  if (brand && typeof brand === "string" && brand.trim()) {
    const brandTrimmed = brand.trim();
    // Avoid duplication if title already starts with brand
    if (trimmedTitle.toLowerCase().startsWith(brandTrimmed.toLowerCase())) {
      return trimmedTitle;
    }
    return normalizeWhitespace(`${brandTrimmed} ${trimmedTitle}`);
  }

  return trimmedTitle;
}

/**
 * Clean image search query using Gemini AI
 */
export async function cleanImageSearchQuery(params: {
  title: string;
  brand?: string;
  store?: string;
}): Promise<CleanResult> {
  const { title, brand, store } = params;

  // Check if AI cleaning is enabled and API key is available
  if (!config.aiTitleCleaningEnabled || !config.geminiApiKey) {
    const fallbackQuery = buildFallbackQuery({ title, brand });
    return {
      query: fallbackQuery,
      method: "fallback",
      rawTitle: title,
      reason: !config.aiTitleCleaningEnabled
        ? "AI title cleaning is disabled"
        : "GEMINI_API_KEY is not set",
    };
  }

  // Empty title check
  if (!title || typeof title !== "string" || !title.trim()) {
    return {
      query: "",
      method: "fallback",
      rawTitle: title || "",
      reason: "Title is empty",
    };
  }

  // Check cache
  const cacheKey = getCacheKey(params);
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Build prompt
  const prompt = `Clean this Korean e-commerce product title for IMAGE SEARCH.

Rules:
- Remove promo/bundle/freebie text: 기획, 더블, 듀오, 세트, 증정, 사은품, 한정, 특가, 구성, 택1, 1+1, 2+1, 리필, 본품, etc.
- Remove bracket/parentheses promo parts like [증정] (...) if they are promos.
- If multiple sizes exist (e.g. 40ml+40ml, 40ml x2), keep ONLY the first size token.
- Keep: brand + product name + first size (if present).
- Output must be short, no extra commentary.

Title: ${title}
${brand ? `Brand: ${brand}` : ""}
${store ? `Store: ${store}` : ""}

Return ONLY JSON with { "query": "cleaned query here" } and nothing else.`;

  // Call Gemini API
  // Note: API key is passed as query parameter (not header) for Gemini REST API
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      response_mime_type: "application/json",
      response_schema: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
          },
        },
        required: ["query"],
      },
    },
  };

  try {
    // Wrap Gemini API call with retry and concurrency limiting
    const response = await limit(() =>
      withRetry(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            controller.abort();
          }, config.aiTitleCleaningTimeoutMs);

          try {
            const response = await axios.post(url, requestBody, {
              signal: controller.signal,
              timeout: config.aiTitleCleaningTimeoutMs,
              headers: {
                "Content-Type": "application/json",
              },
            });

            clearTimeout(timeoutId);
            return response;
          } catch (err) {
            clearTimeout(timeoutId);
            throw err;
          }
        },
        {
          retryMax: config.aiTranslatorRetryMax,
          backoffMinMs: config.aiTranslatorBackoffMinMs,
          backoffMaxMs: config.aiTranslatorBackoffMaxMs,
          logger: (msg, meta) => console.warn(`[gemini:titleCleaner] ${msg}`, meta),
          label: "gemini:titleCleaner",
        }
      )
    );

    // Parse response
    const responseText =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error("Empty response from Gemini API");
    }

    // Strip code fences before JSON parse (defensive)
    const cleanedResponseText = responseText.replace(/^```[a-z]*\n?/i, "").replace(/```$/i, "").trim();

    // Parse JSON
    let parsed: { query?: string };
    try {
      parsed = JSON.parse(cleanedResponseText);
    } catch (parseError) {
      throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
    }

    // Validate and clean query
    if (!parsed.query || typeof parsed.query !== "string") {
      throw new Error("Response missing 'query' field");
    }

    const cleanedQuery = normalizeWhitespace(parsed.query);
    if (!cleanedQuery) {
      throw new Error("Cleaned query is empty");
    }

    const result: CleanResult = {
      query: cleanedQuery,
      method: "ai",
      rawTitle: title,
    };

    // Cache result (with size limit)
    if (cache.size >= CACHE_MAX_SIZE) {
      // Remove oldest entry (simple FIFO - remove first key)
      const firstKey = cache.keys().next().value;
      if (firstKey) {
        cache.delete(firstKey);
      }
    }
    cache.set(cacheKey, result);

    return result;
  } catch (error) {
    // Fallback on any error
    const fallbackQuery = buildFallbackQuery({ title, brand });
    let reason = "Unknown error";

    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNABORTED" || error.name === "AbortError") {
        reason = "Request timeout";
      } else if (error.response) {
        reason = `API error: ${error.response.status} ${error.response.statusText}`;
      } else {
        reason = `Network error: ${error.message}`;
      }
    } else if (error instanceof Error) {
      reason = error.message;
    }

    const result: CleanResult = {
      query: fallbackQuery,
      method: "fallback",
      rawTitle: title,
      reason,
    };

    // Cache fallback result too (to avoid repeated failures)
    if (cache.size >= CACHE_MAX_SIZE) {
      const firstKey = cache.keys().next().value;
      if (firstKey) {
        cache.delete(firstKey);
      }
    }
    cache.set(cacheKey, result);

    return result;
  }
}

