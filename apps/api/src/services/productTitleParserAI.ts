/**
 * AI-based product title parser using Gemini API
 * Parses Korean product titles to extract brandEn, modelEn, titleMn, and searchQuery
 */

import axios, { AxiosError } from "axios";
import { config } from "../config";
import { withRetry } from "../utils/withRetry";
import { createLimiter } from "../utils/limitConcurrency";

export type ParsedTitle = {
  brandEn: string;
  modelEn: string;
  titleMn: string;
  searchQuery: string;
};

export type ParseResult = {
  parsed: ParsedTitle;
  method: "ai" | "fallback";
  reason?: string;
};

// In-memory cache for parsed titles
const cache = new Map<string, ParseResult>();
const CACHE_MAX_SIZE = config.aiTitleCleaningCacheMax;

// Shared concurrency limiter for Gemini API calls
const limit = createLimiter(config.aiTranslatorConcurrency);

/**
 * Get cache key from input parameters
 */
function getCacheKey(params: { titleKo: string; store?: string; brandHint?: string }): string {
  const { titleKo, store, brandHint } = params;
  return `parse::${store || ""}::${brandHint || ""}::${titleKo}`;
}

/**
 * Simple cache eviction (FIFO)
 */
function evictCache() {
  if (cache.size > CACHE_MAX_SIZE) {
    const keysToEvict = cache.size - CACHE_MAX_SIZE + 100;
    let count = 0;
    for (const key of cache.keys()) {
      if (count >= keysToEvict) break;
      cache.delete(key);
      count++;
    }
  }
}

/**
 * Fallback parser (returns empty fields)
 */
function buildFallbackParsed(params: { titleKo: string; brandHint?: string }): ParsedTitle {
  const { titleKo, brandHint } = params;
  return {
    brandEn: brandHint || "",
    modelEn: "",
    titleMn: titleKo.trim(),
    searchQuery: titleKo.trim(),
  };
}

/**
 * Strip code fences if present (defensive)
 */
function stripCodeFences(text: string): string {
  if (!text || typeof text !== "string") return "";
  let cleaned = text.trim();
  // Remove ```json ... ```
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
    cleaned = cleaned.replace(/\s*```$/i, "");
  }
  // Remove ``` ... ```
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "");
    cleaned = cleaned.replace(/\s*```$/, "");
  }
  return cleaned.trim();
}

/**
 * Parse Korean product title using AI (Gemini API)
 * Extracts brandEn, modelEn, titleMn, and searchQuery
 */
export async function parseProductTitleAI(input: {
  titleKo: string;
  store?: string;
  brandHint?: string;
}): Promise<ParseResult> {
  const { titleKo, store, brandHint } = input;
  const cacheKey = getCacheKey(input);

  // 1) Check cache
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  // 2) Handle empty title
  if (!titleKo || titleKo.trim() === "") {
    const result: ParseResult = {
      parsed: buildFallbackParsed(input),
      method: "fallback",
      reason: "Empty title",
    };
    cache.set(cacheKey, result);
    evictCache();
    return result;
  }

  // 3) Fallback if AI is disabled or API key is missing
  if (!config.aiTitleCleaningEnabled || !config.geminiApiKey) {
    const result: ParseResult = {
      parsed: buildFallbackParsed(input),
      method: "fallback",
      reason: "AI disabled or API key missing",
    };
    cache.set(cacheKey, result);
    evictCache();
    return result;
  }

  // 4) Call Gemini API
  const prompt = `Parse Korean e-commerce product title for structured data extraction.

Rules:
- Remove promo/bundle/freebie text: 기획, 더블, 듀오, 세트, 증정, 사은품, 한정, 특가, 구성, 택1, 1+1, 2+1, 리필, 본품, etc.
- Remove bracket/parentheses promo parts like [증정] (...) if they are promos.
- If multiple sizes exist (e.g. 40ml+40ml, 40ml x2), keep ONLY the first size token.
- brandEn: English brand name (Latin characters only, e.g., "Mediheal", "Dr. Jart+")
- modelEn: Concise English model/product line (Latin characters only, include key words + size if important, e.g., "Madecassoside Scar Repair Serum 40ml")
- titleMn: Mongolian translation of product name (Cyrillic script, exclude promo/bundle/freebie text)
- searchQuery: Cleaned Korean query for image search (brand + product name + first size if present)

Title: ${titleKo}
${brandHint ? `Brand hint: ${brandHint}` : ""}
${store ? `Store: ${store}` : ""}

Return ONLY JSON with { "brandEn": "...", "modelEn": "...", "titleMn": "...", "searchQuery": "..." } and nothing else.`;

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
          brandEn: { type: "STRING" },
          modelEn: { type: "STRING" },
          titleMn: { type: "STRING" },
          searchQuery: { type: "STRING" },
        },
        required: ["brandEn", "modelEn", "titleMn", "searchQuery"],
      },
    },
  };

  try {
    // Wrap Gemini API call with retry and concurrency limiting
    const response = await limit(() =>
      withRetry(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), config.aiTitleCleaningTimeoutMs);

          try {
            const response = await axios.post(url, requestBody, {
              headers: {
                "Content-Type": "application/json",
                "x-goog-api-key": config.geminiApiKey,
              },
              timeout: config.aiTitleCleaningTimeoutMs,
              signal: controller.signal,
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
          logger: (msg, meta) => console.warn(`[gemini:productTitleParser] ${msg}`, meta),
          label: "gemini:productTitleParser",
        }
      )
    );

    const responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error("Gemini API response missing content");
    }

    // Strip code fences defensively
    const cleanedText = stripCodeFences(responseText);
    const parsed = JSON.parse(cleanedText);

    // Validate and normalize
    const brandEn = typeof parsed.brandEn === "string" ? parsed.brandEn.trim() : "";
    const modelEn = typeof parsed.modelEn === "string" ? parsed.modelEn.trim() : "";
    const titleMn = typeof parsed.titleMn === "string" ? parsed.titleMn.trim() : "";
    const searchQuery = typeof parsed.searchQuery === "string" ? parsed.searchQuery.trim() : titleKo.trim();

    // Use brandHint as fallback for brandEn if empty
    const finalBrandEn = brandEn || brandHint || "";

    const parsedTitle: ParsedTitle = {
      brandEn: finalBrandEn,
      modelEn: modelEn || "",
      titleMn: titleMn || titleKo.trim(),
      searchQuery: searchQuery || titleKo.trim(),
    };

    const result: ParseResult = {
      parsed: parsedTitle,
      method: "ai",
    };
    cache.set(cacheKey, result);
    evictCache();
    return result;
  } catch (error) {
    const reason = error instanceof AxiosError ? `Network error: ${error.message}` : `AI processing error: ${String(error)}`;
    console.warn(`[AI Title Parser] Failed for "${titleKo}". Reason: ${reason}. Falling back.`);
    const result: ParseResult = {
      parsed: buildFallbackParsed(input),
      method: "fallback",
      reason,
    };
    cache.set(cacheKey, result);
    evictCache();
    return result;
  }
}

