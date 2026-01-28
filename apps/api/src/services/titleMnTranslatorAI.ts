/**
 * AI-based title translator to Mongolian using Gemini API
 * Translates Korean product titles to Mongolian (Cyrillic) with promo text removal
 */

import axios, { AxiosError } from "axios";
import { config } from "../config";
import { withRetry } from "../utils/withRetry";
import { createLimiter } from "../utils/limitConcurrency";

export type TranslateResult = {
  titleMn: string;
  method: "ai" | "fallback";
  reason?: string;
};

// In-memory cache for translations
const cache = new Map<string, TranslateResult>();
const CACHE_MAX_SIZE = config.aiTitleCleaningCacheMax;

// Shared concurrency limiter for Gemini API calls
const limit = createLimiter(config.aiTranslatorConcurrency);

/**
 * Get cache key from input parameters
 */
function getCacheKey(params: { titleKo: string; store?: string }): string {
  const { titleKo, store } = params;
  return `translateMn::${store || ""}::${titleKo}`;
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
 * Minimal fallback: return original title (or cleaned version)
 */
function buildFallbackTitle(titleKo: string): string {
  if (!titleKo || typeof titleKo !== "string") return "";
  
  let cleaned = titleKo.trim();
  
  // Remove common promo patterns (simple regex fallback)
  const promoPatterns = [
    /\s*(더블|기획|증정|세트|세트구성|구성|1\+1|2\+1|대용량|리필|본품|한정|특가|할인|사은품|선물|mini|미니|기획세트)/gi,
    /\s*(\d+\s*(ml|g|매|개|장))\s*\+\s*\d+\s*(ml|g|매|개|장)/gi, // 40ml+40ml -> keep first
  ];

  for (const pattern of promoPatterns) {
    cleaned = cleaned.replace(pattern, (match, p1) => {
      if (p1 && (p1.includes("ml") || p1.includes("g") || p1.includes("매") || p1.includes("개") || p1.includes("장"))) {
        return ` ${p1}`;
      }
      return "";
    }).trim();
  }

  return cleaned || titleKo.trim();
}

/**
 * Strip code fences and quotes if present (defensive)
 */
function cleanResponseText(text: string): string {
  if (!text || typeof text !== "string") return "";
  let cleaned = text.trim();
  
  // Remove markdown code fences
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:mongolian|mn|text)?\s*/i, "");
    cleaned = cleaned.replace(/\s*```$/i, "");
  }
  
  // Remove quotes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1);
  }
  
  return cleaned.trim();
}

/**
 * Translate Korean product title to Mongolian (Cyrillic) using AI (Gemini API)
 */
export async function translateTitleToMn(input: {
  titleKo: string;
  store?: string;
}): Promise<TranslateResult> {
  const { titleKo, store } = input;
  const cacheKey = getCacheKey(input);

  // 1) Check cache
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  // 2) Handle empty title
  if (!titleKo || titleKo.trim() === "") {
    const result: TranslateResult = {
      titleMn: "",
      method: "fallback",
      reason: "Empty title",
    };
    cache.set(cacheKey, result);
    evictCache();
    return result;
  }

  // 3) Fallback if AI is disabled or API key is missing
  if (!config.aiTitleCleaningEnabled || !config.geminiApiKey) {
    const fallbackTitle = buildFallbackTitle(titleKo);
    const result: TranslateResult = {
      titleMn: fallbackTitle,
      method: "fallback",
      reason: "AI disabled or API key missing",
    };
    cache.set(cacheKey, result);
    evictCache();
    return result;
  }

  // 4) Call Gemini API
  const prompt = `Translate this Korean product title to Mongolian (Cyrillic). Remove promo/bundle/freebie text (기획, 더블, 증정, 세트, 1+1 etc). If multiple sizes exist, keep only the first size. Return ONLY the Mongolian title text, no quotes, no markdown.

Title: ${titleKo}
${store ? `Store: ${store}` : ""}`;

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
      temperature: 0.3,
      maxOutputTokens: 200,
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
          logger: (msg, meta) => console.warn(`[gemini:titleMnTranslator] ${msg}`, meta),
          label: "gemini:titleMnTranslator",
        }
      )
    );

    const responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error("Gemini API response missing content");
    }

    // Clean response text (remove code fences, quotes)
    const cleanedText = cleanResponseText(responseText);
    
    if (!cleanedText || cleanedText.length === 0) {
      throw new Error("Gemini API returned empty translation");
    }

    const result: TranslateResult = {
      titleMn: cleanedText,
      method: "ai",
    };
    cache.set(cacheKey, result);
    evictCache();
    return result;
  } catch (error) {
    const reason = error instanceof AxiosError ? `Network error: ${error.message}` : `AI processing error: ${String(error)}`;
    console.warn(`[AI Title Translator] Failed for "${titleKo}". Reason: ${reason}. Falling back.`);
    const fallbackTitle = buildFallbackTitle(titleKo);
    const result: TranslateResult = {
      titleMn: fallbackTitle,
      method: "fallback",
      reason,
    };
    cache.set(cacheKey, result);
    evictCache();
    return result;
  }
}

