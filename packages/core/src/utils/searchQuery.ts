/**
 * Search query utilities for building optimized image search queries
 */

/**
 * Normalize whitespace: collapse multiple spaces to single space, trim
 */
export function normalizeWhitespace(s: string): string {
  if (!s || typeof s !== "string") return "";
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Shorten Korean product title by removing promo/trailer phrases
 * Rules:
 * A) Cut off after promo tokens: 더블, 기획, 증정, 세트, etc.
 * B) Cut off bracketed promos: remove trailing [promo] or (promo)
 * C) Normalize volume: "40ml+40ml" -> "40ml", "40ml x 2" -> "40ml"
 * D) Keep core name + first size
 */
export function shortenKoreanProductTitle(title: string): string {
  if (!title || typeof title !== "string") return "";

  let result = title.trim();
  if (!result) return "";

  // C) Normalize volume patterns first (before truncation)
  // Pattern: (\d+\s*(ml|g|매|개|장))\s*\+\s*\d+\s*(ml|g|매|개|장)
  result = result.replace(/(\d+\s*(?:ml|g|매|개|장))\s*\+\s*\d+\s*(?:ml|g|매|개|장)/gi, "$1");
  
  // Pattern: (\d+\s*(ml|g|매|개|장))\s*[x*×]\s*\d+
  result = result.replace(/(\d+\s*(?:ml|g|매|개|장))\s*[x*×]\s*\d+/gi, "$1");

  // A) Find earliest occurrence of promo tokens and truncate
  const promoTokens = [
    "더블",
    "기획",
    "증정",
    "세트",
    "세트구성",
    "구성",
    "1+1",
    "2+1",
    "대용량",
    "리필",
    "본품",
    "한정",
    "특가",
    "할인",
    "사은품",
    "선물",
    "mini",
    "미니",
    "기획세트",
  ];

  let earliestIndex = result.length;
  for (const token of promoTokens) {
    const index = result.indexOf(token);
    if (index !== -1 && index < earliestIndex) {
      earliestIndex = index;
    }
  }

  if (earliestIndex < result.length) {
    result = result.substring(0, earliestIndex).trim();
  }

  // B) Remove trailing bracketed promos
  // Check for [ or ( at the end and remove if contains promo keywords
  const bracketPattern = /[\[\(]([^\])]+)[\]\)]\s*$/;
  const bracketMatch = result.match(bracketPattern);
  if (bracketMatch) {
    const bracketContent = bracketMatch[1].toLowerCase();
    const hasPromoKeyword = promoTokens.some((token) =>
      bracketContent.includes(token.toLowerCase())
    );
    if (hasPromoKeyword) {
      result = result.replace(bracketPattern, "").trim();
    }
  }

  // Normalize whitespace and return
  return normalizeWhitespace(result);
}

/**
 * Build optimized image search query from product data
 * Returns: brand + shortened title (or just shortened title if no brand)
 * Does NOT append store name (e.g., "oliveyoung") unless explicitly requested
 */
export function buildImageSearchQuery(params: {
  title: string;
  brand?: string;
  store?: string;
}): string {
  const { title, brand } = params;

  if (!title || typeof title !== "string") {
    return "";
  }

  const shortTitle = shortenKoreanProductTitle(title);
  if (!shortTitle) {
    return "";
  }

  // If brand exists, prepend it (but avoid duplication if title already starts with brand)
  if (brand && typeof brand === "string" && brand.trim()) {
    const brandTrimmed = brand.trim();
    // Check if shortTitle already starts with the brand (case-insensitive)
    if (shortTitle.toLowerCase().startsWith(brandTrimmed.toLowerCase())) {
      return normalizeWhitespace(shortTitle);
    }
    return normalizeWhitespace(`${brandTrimmed} ${shortTitle}`);
  }

  return shortTitle;
}

