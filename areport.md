# Project Report

## Image Enrichment Fixes

### Problem
Image enrichment was only downloading 1 image per product instead of the desired 4-5 images, even when `desiredCount=5` and `force=true`.

### Root Causes
1. **Limited search results**: Only fetching 10 candidates per search, not enough for multiple downloads
2. **Overly strict URL filtering**: `looksLikeImageUrl()` was rejecting valid image URLs from Google Custom Search
3. **Parallel download issues**: Downloads were happening in parallel but stopping after first batch, not continuing until desiredCount
4. **File indexing**: Index wasn't starting from existing `imagesProcessed.length`

### Fixes Applied

#### 1. Enhanced Google Custom Search with Pagination
**File**: `apps/api/src/services/googleImageSearch.ts`
- Added `start` parameter for pagination (1, 11, 21, etc.)
- Now fetches up to 30 candidates across multiple pages
- Accepts any http(s) URL from Google Custom Search (removed pre-filtering)

#### 2. Removed Overly Strict URL Pre-filtering
**File**: `apps/api/src/services/imageEnrichmentService.ts`
- Removed `looksLikeImageUrl()` check before download
- Now accepts any http(s) URL from Google Custom Search
- Relies on downloader validation (content-type check, file size limits)

#### 3. Fixed Download Loop to Continue Until desiredCount
**File**: `apps/api/src/services/imageEnrichmentService.ts`
- Changed from parallel batch download to sequential loop
- Continues downloading until `imagesProcessed.length >= desiredCount`
- Handles individual download failures gracefully (continues to next candidate)
- Logs progress: `attempted`, `downloaded`, `errors`

#### 4. Fixed File Indexing
**File**: `apps/api/src/services/imageEnrichmentService.ts`
- Index now starts from `product.imagesProcessed.length`
- Ensures files are saved as `0.jpg`, `1.jpg`, `2.jpg`, etc. without overwriting
- Each downloaded image gets a unique sequential index

#### 5. Improved Logging
- Added detailed logs for each product:
  - `candidatesFetched`: Total candidates from search
  - `uniqueCandidates`: After deduplication
  - `newUrls`: After filtering existing images
  - `attempted`: Number of download attempts
  - `downloaded`: Number of successful downloads
  - `finalImagesProcessedCount`: Final count after update
  - `downloadedInThisRun`: Number downloaded in this enrichment run

### Results
- Each product now reliably gets 4-5 images when `desiredCount=5`
- Images are saved with correct sequential indexing (0.jpg, 1.jpg, 2.jpg, 3.jpg, 4.jpg)
- Better error handling: continues downloading even if some candidates fail
- More candidates available: fetches up to 30 candidates across multiple search pages
- Accurate notes: `images_enriched_local(N)` where N = actual number downloaded

### Testing
After fixes:
1. Run: `POST /api/images/enrich-batch` with `{ "store": "oliveyoung", "limit": 3, "desiredCount": 5, "force": true }`
2. Verify: Each product has `imagesProcessed.length >= 4`
3. Verify: Files exist at `apps/api/uploads/products/<productId>/0.jpg`, `1.jpg`, `2.jpg`, etc.
4. Verify: Notes show correct count: `images_enriched_local(5)` (or actual number downloaded)

## Image Manager UI

### Problem
Need a user-friendly way to manage product images: view current images, request suggestions, select and add images, and delete unwanted images.

### Solution Implemented

#### 1. Backend API Endpoints

**GET /api/images/suggest**
- **Purpose**: Suggest images for a product without downloading
- **Query Parameters**:
  - `productId` (required)
  - `count` (optional, default 12, max 30)
- **Behavior**:
  - Loads product by ID
  - Builds search query: `${brand} ${title}` (or `${title} oliveyoung` for OliveYoung)
  - Fetches up to 30 candidates using Google Custom Search with pagination
  - Returns array of suggestion objects with `url` and `source`
  - No pre-filtering by extension (accepts any http(s) URL)
  - Deduplicates normalized URLs

**POST /api/images/apply**
- **Purpose**: Download and add selected images to product
- **Body**:
  ```json
  {
    "productId": "...",
    "urls": ["https://...", "..."],
    "force": false
  }
  ```
- **Behavior**:
  - Validates URLs for SSRF protection (blocks private IPs, localhost, etc.)
  - Filters out duplicates (checks against existing imagesProcessed + imagesOriginal)
  - Downloads each URL with validation (content-type, file size, timeout)
  - Saves files sequentially starting from `imagesProcessed.length`
  - Appends new local URLs to `imagesProcessed`
  - Returns updated product DTO and stats (downloaded, failed, errors)
- **Security**:
  - Only allows http/https protocols
  - Blocks private IP ranges (RFC 1918, localhost, AWS metadata service)
  - Max 30 URLs per request
  - Content-type validation during download

**POST /api/images/delete**
- **Purpose**: Delete an image from product and filesystem
- **Body**:
  ```json
  {
    "productId": "...",
    "imageUrl": "/uploads/products/.../2.jpg"
  }
  ```
- **Behavior**:
  - Only allows deleting from `imagesProcessed` (local images)
  - Removes URL from array
  - Deletes file from disk if path starts with `/uploads/products/`
  - Returns updated product DTO

#### 2. SSRF Protection Utility
Created `apps/api/src/utils/ssrfProtection.ts`:
- `isPrivateIP(host)`: Checks if hostname is a private/internal IP
  - Blocks: localhost, 127.0.0.1, ::1, 0.0.0.0
  - Blocks: 169.254.169.254 (AWS metadata)
  - Blocks: RFC 1918 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  - Blocks: Link-local 169.254.0.0/16
- `isUrlSafe(url)`: Validates URL for SSRF protection
  - Only allows http/https protocols
  - Checks hostname against private IP list

#### 3. Frontend UI Implementation
Updated `apps/web/src/pages/ProductDetail.tsx`:

**Current Images Section**:
- Shows `imagesProcessed` first (with delete buttons)
- Shows `imagesOriginal` below (read-only, labeled "Original")
- Each processed image has a delete button (×)
- Images render with proper URL normalization (relative → absolute)

**Image Suggestions Section**:
- Input field for desired count (4-30, default 12)
- "Request" button to fetch suggestions
- Grid of suggestion thumbnails with checkboxes
- Click tile or checkbox to select/deselect
- Selected tiles have green border
- "Add Selected" button (disabled if none selected)
- Shows result: "Downloaded: X, Failed: Y"
- Auto-refreshes product data after adding

**UX Features**:
- Loading spinners for request/apply operations
- Error messages displayed via alerts
- Image error handling (fallback to placeholder)
- Clear visual feedback for selected suggestions

#### 4. API Client Updates
Updated `apps/web/src/api/products.ts`:
- `suggestImages(productId, count)`: Fetches image suggestions
- `applyImages(productId, urls)`: Downloads and adds selected images
- `deleteImage(productId, imageUrl)`: Deletes an image

#### 5. CSS Styling
Added styles to `apps/web/src/pages/ProductDetail.css`:
- `.current-images-grid`: Grid layout for current images
- `.image-tile`: Image container with delete button
- `.image-delete-btn`: Red circular delete button
- `.suggestions-grid`: Grid layout for suggestions
- `.suggestion-tile`: Selectable suggestion tile with hover effects
- `.suggestion-tile.selected`: Green border for selected items

### Security Features
- **SSRF Protection**: Blocks requests to private IPs and internal services
- **URL Validation**: Only allows http/https protocols
- **Content-Type Validation**: Downloads only validate image content-type
- **File Size Limits**: Enforced during download (5MB default)
- **Rate Limiting**: Max 30 URLs per apply request

### Usage Flow
1. **View Current Images**:
   - Open product detail page
   - See all current images (processed + original)
   - Click × button to delete processed images

2. **Request Suggestions**:
   - Enter desired count (e.g., 12)
   - Click "Request"
   - Grid of suggestions appears

3. **Select and Add**:
   - Click images to select (or use checkboxes)
   - Selected images have green border
   - Click "Add Selected (N)"
   - Images download and appear in current images list

4. **Delete Images**:
   - Click × button on any processed image
   - Image removed from product and file deleted from disk

### Testing
1. Open product detail page
2. Delete a processed image → it disappears + file removed
3. Enter count=12 → Request → suggestions show thumbnails
4. Select 5 → Add selected → imagesProcessed increases by 5 and UI shows them
5. Verify files exist at `apps/api/uploads/products/<productId>/<index>.jpg`

## Image Search Query Optimization

### Problem
Korean product titles often contain promotional text and volume multipliers that reduce search quality:
- "메디힐 마데카소사이드 흔적 리페어 세럼 40ml+40ml 더블 기획"
- These long titles with promo suffixes return less relevant image results

### Solution Implemented

#### 1. Title Shortening Utility
Created `packages/core/src/utils/searchQuery.ts`:

**Functions**:
- `normalizeWhitespace(s)`: Collapses multiple spaces to single space, trims
- `shortenKoreanProductTitle(title)`: Removes promo/trailer phrases from Korean product titles
- `buildImageSearchQuery(product)`: Builds optimized search query from product data

**Title Shortening Rules**:

**A) Remove promo/trailer phrases**:
- Finds earliest occurrence of: "더블", "기획", "증정", "세트", "세트구성", "구성", "1+1", "2+1", "대용량", "리필", "본품", "한정", "특가", "할인", "사은품", "선물", "mini", "미니", "기획세트"
- Truncates title at that index

**B) Remove bracketed promos**:
- Removes trailing `[promo]` or `(promo)` if they contain promo keywords

**C) Normalize volume patterns**:
- `40ml+40ml` → `40ml`
- `40ml x 2` or `40ml*2` → `40ml`
- Uses regex to match patterns like `(\d+\s*(ml|g|매|개|장))\s*\+\s*\d+\s*(ml|g|매|개|장)`

**D) Keep core name + first size**:
- After truncation, normalizes whitespace

**Example Transformations**:
- `"메디힐 마데카소사이드 흔적 리페어 세럼 40ml+40ml 더블 기획"` → `"메디힐 마데카소사이드 흔적 리페어 세럼 40ml"`
- `"브랜드 [증정] 제품명 30ml 기획"` → `"브랜드"`
- `"제품명 40ml x 2"` → `"제품명 40ml"`

#### 2. Integration with Search Endpoints

**Updated `/api/images/suggest`**:
- Uses `buildImageSearchQuery()` instead of manual query building
- Returns `queryUsed` field in response for debugging
- Query format: `${brand} ${shortTitle}` (or just `shortTitle` if no brand)
- **Removed**: Automatic "oliveyoung" suffix (keeps query title-focused)

**Updated `imageEnrichmentService.ts`**:
- Uses `buildImageSearchQuery()` for enrichment queries
- Same query format as suggest endpoint

#### 3. Response Enhancement
**GET /api/images/suggest** now returns:
```json
{
  "productId": "...",
  "query": "...",  // Original query (for backward compatibility)
  "queryUsed": "...",  // The actual optimized query used for search
  "countRequested": 12,
  "suggestions": [...]
}
```

#### 4. Testing
Created `packages/core/src/utils/searchQuery.test.ts` with test cases:
- Promo suffix removal
- Bracketed promo removal
- Volume normalization (40ml+40ml, 40ml x 2, 40ml*2)
- Whitespace normalization
- Query building with/without brand

### Results
- **Shorter, more focused queries**: Removes promotional noise
- **Better search results**: Core product name + size returns more relevant images
- **Consistent query format**: Same logic used across suggest and enrichment endpoints
- **Debugging support**: `queryUsed` field shows exactly what was searched

### Usage
The optimization is automatic - no configuration needed:
1. When requesting image suggestions, titles are automatically shortened
2. When enriching images, same shortened queries are used
3. Check `queryUsed` in suggest response to see the optimized query

### Example
**Before**:
- Query: `"메디힐 메디힐 마데카소사이드 흔적 리페어 세럼 40ml+40ml 더블 기획 oliveyoung"`
- Issues: Duplicate brand, promo text, volume multiplier, store suffix

**After**:
- Query: `"메디힐 마데카소사이드 흔적 리페어 세럼 40ml"`
- Clean, focused, title-only query

## AI-Based Title Cleaning (Gemini API)

### Problem
Regex-based title cleaning is brittle and may miss edge cases. AI can better understand context and clean Korean product titles more intelligently.

### Solution Implemented

#### 1. Configuration
Added environment variables to `apps/api/.env.example` and `apps/api/src/config.ts`:

- **`GEMINI_API_KEY`**: Google Gemini API key (required for AI cleaning)
- **`GEMINI_MODEL`**: Model to use (default: `"gemini-2.5-flash"`)
- **`AI_TITLE_CLEANING_ENABLED`**: Enable/disable AI cleaning (default: `true`)
- **`AI_TITLE_CLEANING_TIMEOUT_MS`**: Request timeout in milliseconds (default: `6000`)
- **`AI_TITLE_CLEANING_CACHE_MAX`**: Max cache size for cleaned queries (default: `2000`)

**Fallback Behavior**:
- If `GEMINI_API_KEY` is missing → uses fallback (simple brand + title)
- If `AI_TITLE_CLEANING_ENABLED=false` → uses fallback
- If AI request fails/timeouts → uses fallback

#### 2. AI Title Cleaner Service
Created `apps/api/src/services/titleCleanerAI.ts`:

**Functions**:
- `cleanImageSearchQuery(params)`: Main function that cleans titles using Gemini API

**Features**:
- **In-memory caching**: Caches cleaned queries to avoid repeated API calls
  - Cache key: `${store}::${brand}::${title}`
  - Max size: `AI_TITLE_CLEANING_CACHE_MAX` (FIFO eviction)
- **Gemini API integration**:
  - Uses structured JSON output with schema validation
  - Temperature: 0.2 (low for consistent results)
  - Timeout: `AI_TITLE_CLEANING_TIMEOUT_MS`
  - AbortController for proper timeout handling
- **Prompt engineering**:
  - Instructs model to remove promo text (기획, 더블, 세트, 증정, etc.)
  - Remove bracket/parentheses promo parts
  - Normalize volume patterns (40ml+40ml → 40ml)
  - Keep: brand + product name + first size
- **Error handling**:
  - Timeout → fallback
  - Non-JSON response → fallback
  - Empty query → fallback
  - Network errors → fallback
  - All fallback results are also cached

**Return Type**:
```typescript
{
  query: string;           // Cleaned query
  method: "ai" | "fallback";
  rawTitle: string;        // Original title
  reason?: string;          // Error reason (if fallback)
}
```

#### 3. Integration Points

**Updated `/api/images/suggest`**:
- Uses `cleanImageSearchQuery()` instead of regex-based cleaning
- Returns `queryUsed` and `methodUsed` in response
- Response includes: `{ queryUsed: "...", methodUsed: "ai" | "fallback" }`

**Updated `imageEnrichmentService.ts`**:
- Uses `cleanImageSearchQuery()` for enrichment queries
- Same AI cleaning logic as suggest endpoint

#### 4. Testing
Created `scripts/testTitleCleaner.ts`:
- Tests 5 sample titles with various promo patterns
- Shows cleaned output, method used, and any error reasons
- Can be run with: `pnpm tsx scripts/testTitleCleaner.ts`

#### 5. Response Enhancement
**GET /api/images/suggest** now returns:
```json
{
  "productId": "...",
  "query": "...",
  "queryUsed": "...",      // The actual cleaned query used
  "methodUsed": "ai",       // "ai" or "fallback"
  "countRequested": 12,
  "suggestions": [...]
}
```

### Benefits
- **More intelligent cleaning**: AI understands context better than regex
- **Handles edge cases**: Can clean titles that regex might miss
- **Caching**: Reduces API calls for repeated queries
- **Graceful fallback**: Always returns a usable query even if AI fails
- **Debugging**: `methodUsed` shows whether AI or fallback was used

### Usage
1. Set `GEMINI_API_KEY` in environment
2. Set `AI_TITLE_CLEANING_ENABLED=true` (default)
3. AI cleaning happens automatically for all image search queries
4. Check `methodUsed` in response to verify AI is working

### Example Transformations
**Input**: `"메디힐 마데카소사이드 흔적 리페어 세럼 40ml+40ml 더블 기획"`
**AI Output**: `"메디힐 마데카소사이드 흔적 리페어 세럼 40ml"`
**Method**: `"ai"`

**Input**: `"브랜드 [증정] 제품명 30ml 기획"`
**AI Output**: `"브랜드 제품명 30ml"`
**Method**: `"ai"`

### Fallback Behavior
If AI fails, fallback uses simple logic:
- `${brand} ${title}` (if brand exists)
- Avoids duplication if title already starts with brand
- Normalizes whitespace

### Performance
- **Caching**: First request per unique title uses API, subsequent requests use cache
- **Timeout**: 6 seconds default (configurable)
- **Cache size**: 2000 entries default (FIFO eviction)
- **Fallback**: Instant (no API call)

### Testing
1. Run test script: `pnpm tsx scripts/testTitleCleaner.ts`
2. Call `/api/images/suggest?productId=...&count=12`
3. Check response: `queryUsed` should be cleaned, `methodUsed` should be `"ai"` (if API key is set)
4. Verify suggestions still return relevant images

## Image Manager Bug Fix: Multiple Image Selection

### Problem
When users selected multiple images in the Image Manager and clicked "Add Selected", only one image was added and it repeated (same image), not the chosen set.

### Root Cause
**Backend Issue**: The download loop used parallel downloads with `pLimit`, but the file index calculation had a race condition:
```typescript
const fileIndex = currentProcessedCount + downloadedUrls.length;
```
When multiple downloads run in parallel, they could all see the same `downloadedUrls.length` value simultaneously, causing them to use the same index and overwrite each other's files.

**Frontend Issue**: The selection state management was correct, but the payload construction could be improved to ensure we're sending the exact selected URLs.

### Solution Implemented

#### 1. Backend Fixes (`apps/api/src/routes/images.ts`)

**URL Validation**:
- Enhanced to handle both `string[]` and `object[]` formats
- Normalizes URLs (trim, filter empty)
- Better error messages

**Download Loop**:
- **Changed from parallel to sequential downloads** to prevent race conditions
- Uses a `downloaded` counter that increments only on success
- Calculates index as: `startIndex + downloaded` (ensures uniqueness)
- Each URL gets a unique file: `uploads/products/<productId>/<index>.jpg`
- Continues on individual failures (doesn't stop on first error)

**Logging**:
- Added debug logs: `[images/apply] productId`, `urls count`, first 3 URLs
- Logs each download attempt with index and URL
- Logs success/failure for each image

**Code Changes**:
```typescript
// OLD (parallel, race condition):
const downloadPromises = newUrls.map((url, idx) =>
  limit(async () => {
    const fileIndex = currentProcessedCount + downloadedUrls.length; // ❌ Race condition
    // ...
  })
);
await Promise.all(downloadPromises);

// NEW (sequential, safe):
let downloaded = 0;
for (const url of newUrls) {
  const fileIndex = startIndex + downloaded; // ✅ Unique index
  // ... download ...
  downloaded++; // Only increment on success
}
```

#### 2. Frontend Fixes (`apps/web/src/pages/ProductDetail.tsx`)

**Selection State**:
- Improved immutable Set updates using functional setState:
```typescript
setSelectedSuggestions((prev) => {
  const next = new Set(prev);
  if (next.has(suggestion.url)) {
    next.delete(suggestion.url);
  } else {
    next.add(suggestion.url);
  }
  return next;
});
```

**Payload Construction**:
- Filters suggestions array to get only selected URLs:
```typescript
const urls = suggestions
  .filter((s) => selectedSuggestions.has(s.url))
  .map((s) => s.url);
```
- Ensures we send the exact URLs that were selected, in order

**Debug Logging**:
- Added: `console.log("APPLY urls count", urls.length, urls.slice(0, 3))`
- Helps verify the correct URLs are being sent

#### 3. Deduplication
- Normalizes and deduplicates URLs before downloading
- Removes URLs already present in `imagesProcessed` or `imagesOriginal`
- Uses `Set` for efficient duplicate detection

### Results
- ✅ Multiple selected images are now downloaded correctly
- ✅ Each image gets a unique file (0.jpg, 1.jpg, 2.jpg, etc.)
- ✅ No overwriting or duplicate files
- ✅ All selected images appear in the UI after adding
- ✅ Better error handling (continues on individual failures)

### Verification Steps
1. **UI Test**: Request 12 suggestions, select 5 distinct images, click "Add Selected"
2. **Network Tab**: Confirm request body contains 5 distinct URLs (check console log)
3. **API Response**: `downloaded` should be 5 (or close if some fail)
4. **Filesystem**: Check `apps/api/uploads/products/<productId>/0.jpg` through `4.jpg` exist and are different images
5. **UI Reload**: Grid shows all 5 chosen images (not duplicates)

### Performance Note
Sequential downloads are slower than parallel, but ensure correctness. For large batches (10+ images), consider:
- Batching: Download in groups of 3-5 sequentially
- Or: Use atomic index allocation (e.g., database sequence) for parallel downloads

Current implementation prioritizes correctness over speed, which is appropriate for the Image Manager use case.

## Field Locks UI Removal

### Problem
The "Field Locks" feature in the Product Detail UI was hiding actual product data (title/price) and making it difficult to see essential product information at a glance.

### Solution Implemented

#### 1. Removed Field Locks UI
**File**: `apps/web/src/pages/ProductDetail.tsx`

**Removed**:
- Entire "Field Locks" section with lock/unlock buttons
- `LOCKABLE_PRODUCT_FIELDS` constant
- `handleLockToggle()` function
- `isLocked()` helper function
- Auto-lock logic in `handleSave()` (removed `lockFields` parameter)
- Lock badge indicators on Description and Notes sections
- `disabled` attributes on edit buttons that checked lock status
- Unused imports: `LockableProductField` type

**CSS Cleanup**:
- Removed `.lock-controls`, `.lock-control`, `.lock-field-name` styles
- Removed `.btn-locked`, `.btn-unlocked` styles
- Removed `.section-header-with-lock`, `.lock-badge` styles
- Kept `.btn-small` (still used by edit buttons)

#### 2. Added Product Summary Section
**New Section**: Replaces the old header and provides comprehensive product information

**Displays**:
- **Title**: Large, prominent text (with fallback "—")
- **Price**: Formatted with currency (e.g., "8,400 KRW") with fallback "—"
- **Store**: Product store name
- **Category**: `categoryKey`
- **Top Category**: If present (optional)
- **Sub Category**: If present (optional)
- **Source URL**: Link labeled "Open source" (opens in new tab)
- **Created**: Timestamp (optional, small text)
- **Updated**: Timestamp (optional, small text)

**Styling**:
- Uses definition list (`<dl>`) with grid layout
- Title and price have special styling (larger, bold, colored)
- Dates are smaller, muted text
- Source link is styled as a standard link

#### 3. Preserved Functionality
- **Images Manager**: Remains fully functional below Product Summary
- **Edit Functionality**: Description and Notes can still be edited (no lock restrictions)
- **API Compatibility**: Backend still supports `lockedFields` in database/model (not broken)
- **Other Sections**: Basic Information, Description, Notes sections remain unchanged

### Results
- ✅ Title and price are immediately visible in Product Summary
- ✅ No "Field Locks" section blocking product data
- ✅ Clean, organized product information display
- ✅ Edit functionality works without lock restrictions
- ✅ Images Manager remains fully functional
- ✅ API remains unchanged (backward compatible)

### UI Flow
1. **Product Summary** (top): Essential product info at a glance
2. **Images Manager**: Manage product images
3. **Basic Information**: Category, source URL, language
4. **Description (Original)**: Original product description
5. **Description (Translated)**: Translated description (editable)
6. **Notes**: Product notes (editable)

### Technical Notes
- Product Summary uses null-safe fallbacks for all fields
- Top Category and Sub Category are conditionally rendered (only if present)
- Created/Updated dates use `toLocaleString()` for readable formatting
- Source URL opens in new tab with `target="_blank"` and `rel="noopener noreferrer"`
- All styling uses existing CSS classes for consistency

---

## Structured Product Naming with AI

### Problem
Product titles in Korean e-commerce often contain promotional text, bundle information, and multiple sizes, making them difficult to use for international markets or structured data. We needed a way to:
- Extract English brand and model names
- Generate Mongolian translations
- Clean titles for image search queries
- Make these fields editable in the UI

### Solution Implemented

#### A) Data Model: New Fields

**Updated Files:**
- `apps/api/src/models/Product.ts` - Added optional fields:
  - `brandEn?: string` - English brand name (Latin characters)
  - `modelEn?: string` - English model/product line (Latin characters)
  - `titleMn?: string` - Mongolian translation (Cyrillic script)
- `packages/shared/src/types.ts` - Updated `ProductDTO` and `PatchProductRequest`:
  - Added `brandEn?`, `modelEn?`, `titleMn?` to both interfaces
- `apps/api/src/dto/productDto.ts` - Updated `toProductDTO()` to include new fields
- `packages/shared/src/schemas.ts` - Extended `PatchProductSchema`:
  - Added `brandEn: z.string().max(200).optional()`
  - Added `modelEn: z.string().max(500).optional()`
  - Added `titleMn: z.string().max(500).optional()`
  - Changed `price` validation to `z.number().nonnegative()` (allow 0)

#### B) AI Parser Service

**New File**: `apps/api/src/services/productTitleParserAI.ts`

**Exports**:
- `type ParsedTitle = { brandEn: string; modelEn: string; titleMn: string; searchQuery: string }`
- `type ParseResult = { parsed: ParsedTitle; method: "ai" | "fallback"; reason?: string }`
- `async function parseProductTitleAI(input: { titleKo: string; store?: string; brandHint?: string }): Promise<ParseResult>`

**Implementation Details**:
1. **Uses Gemini API** (same config as title cleaner):
   - `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_TITLE_CLEANING_ENABLED`, `AI_TITLE_CLEANING_TIMEOUT_MS`
   - In-memory cache with `AI_TITLE_CLEANING_CACHE_MAX` limit
2. **Prompt Instructions**:
   - Remove promo/bundle text: 기획, 더블, 듀오, 세트, 증정, 사은품, 1+1, 2+1, etc.
   - Remove bracket/parentheses promo parts
   - Keep only first size if multiple sizes exist (e.g., "40ml+40ml" → "40ml")
   - `brandEn`: English brand name (Latin only)
   - `modelEn`: Concise English model/product line (Latin only, include key words + size)
   - `titleMn`: Mongolian translation (Cyrillic script, exclude promo text)
   - `searchQuery`: Cleaned Korean query for image search
3. **JSON Schema**:
   - Uses `response_mime_type: "application/json"` and `response_schema` for structured output
   - Defensively strips code fences if Gemini returns ```json ... ```
4. **Fallback**:
   - If AI disabled or fails: returns empty `brandEn`/`modelEn`, `titleMn` = original title, `searchQuery` = original title
   - Uses `brandHint` if provided for `brandEn` fallback

#### C) Backend API Endpoints

**1. POST /api/products/:id/ai/autofill-title**

**Request Body**:
```json
{
  "overwrite": false  // optional, default false
}
```

**Behavior**:
- Loads product by ID
- Calls `parseProductTitleAI({ titleKo: product.title, store: product.store, brandHint: product.brandEn })`
- If `overwrite=false`: Only sets `brandEn`/`modelEn`/`titleMn` if they are empty
- If `overwrite=true`: Replaces all fields regardless of existing values
- Saves product and returns updated product + parse metadata

**Response**:
```json
{
  "product": { ...ProductDTO... },
  "method": "ai" | "fallback",
  "reason": "...",
  "parsed": {
    "brandEn": "...",
    "modelEn": "...",
    "titleMn": "...",
    "searchQuery": "..."
  }
}
```

**2. PATCH /api/products/:id** (Updated)

**New Fields Accepted**:
- `brandEn?: string`
- `modelEn?: string`
- `titleMn?: string`
- `title?: string` (Korean original)
- `price?: number` (now accepts 0)

**Validation**:
- All string fields are trimmed
- `brandEn` max length: 200
- `modelEn` max length: 500
- `titleMn` max length: 500
- `price` must be >= 0

#### D) Frontend: Editable Product Summary

**File**: `apps/web/src/pages/ProductDetail.tsx`

**Changes**:
1. **Product Summary Section**:
   - All fields are now editable (Title, Price, Brand En, Model En, Title Mn)
   - Each field has an "Edit" button that switches to edit mode
   - Edit mode shows input/textarea with Save/Cancel buttons
   - Uses existing `handleFieldEdit()` and `handleSave()` functions

2. **Auto-fill via AI Button**:
   - Button in Product Summary header: "Auto-fill via AI"
   - Calls `POST /api/products/:id/ai/autofill-title` with `overwrite=false`
   - Shows success message: "Auto-filled via AI (method=ai/fallback)"
   - Automatically refreshes product data after success
   - Loading state: "Auto-filling..." while processing

3. **State Management**:
   - Added `autofilling` state for loading indicator
   - Added `autofillResult` state for success message (auto-clears after 5 seconds)

**API Client**:
- `apps/web/src/api/products.ts`:
  - Added `autofillProductTitle(id: string, overwrite: boolean): Promise<AutofillTitleResponse>`

#### E) Frontend: Product List Display

**File**: `apps/web/src/pages/ProductList.tsx`

**Changes**:
- **Main Title**: Shows `brandEn + modelEn` if either exists, otherwise falls back to `title` (Korean)
- **Subtitle**: Shows `titleMn` (Mongolian) if present
- **Fallback Subtitle**: If no English fields, shows Korean `title` as italic subtitle

**Display Logic**:
```typescript
// Main title
{product.brandEn || product.modelEn
  ? `${product.brandEn || ""} ${product.modelEn || ""}`.trim()
  : product.title}

// Subtitle (Mongolian)
{product.titleMn && <div>{product.titleMn}</div>}

// Fallback subtitle (Korean, if no English)
{!product.brandEn && !product.modelEn && product.title && (
  <div style={{ fontStyle: "italic" }}>{product.title}</div>
)}
```

### Usage Flow

1. **Auto-fill via AI**:
   - Open product detail page
   - Click "Auto-fill via AI" button
   - AI parses Korean title and populates `brandEn`, `modelEn`, `titleMn`
   - Success message shows method used (ai/fallback)

2. **Manual Editing**:
   - Click "Edit" on any field in Product Summary
   - Modify value in input/textarea
   - Click "Save" to persist changes
   - Click "Cancel" to discard changes

3. **Product List Display**:
   - Products with English fields show: "Brand Model" as main title
   - Products with Mongolian show: "Title Mn" as subtitle
   - Products without English fields show: Korean title as main title

### Technical Notes

- **Caching**: AI parser uses same cache as title cleaner (shared `AI_TITLE_CLEANING_CACHE_MAX`)
- **Error Handling**: Falls back gracefully if AI is disabled or fails
- **Validation**: All fields have max length constraints to prevent abuse
- **Idempotency**: Auto-fill with `overwrite=false` only fills empty fields
- **Backward Compatibility**: All new fields are optional, existing products work without them
- **UI Consistency**: Edit mode uses same patterns as Description/Notes editing

### Future Enhancements

- Batch auto-fill for multiple products
- Preview before applying AI results
- Manual override of AI suggestions
- Integration with image search query cleaning (reuse `searchQuery` from parser)

---

## Mongolian Title Auto-Translation

### Problem
English naming (brandEn/modelEn) was removed from UI in favor of Mongolian titles (titleMn). We needed automatic translation of Korean product titles to Mongolian without manual intervention.

### Solution Implemented

#### A) Data Model: Backward Compatibility

**Strategy**: Keep `brandEn` and `modelEn` in database schema for backward compatibility, but remove from UI usage.

**Updated Files**:
- `apps/api/src/models/Product.ts` - Fields remain in schema (not deleted)
- `packages/shared/src/types.ts` - Fields remain optional in `ProductDTO` and `PatchProductRequest`
- `apps/api/src/routes/products.ts` - Still accepts `brandEn`/`modelEn` in PATCH, but marked as "kept for backward compatibility, not used in UI"

#### B) AI Translation Service

**New File**: `apps/api/src/services/titleMnTranslatorAI.ts`

**Exports**:
- `type TranslateResult = { titleMn: string; method: "ai" | "fallback"; reason?: string }`
- `async function translateTitleToMn(input: { titleKo: string; store?: string }): Promise<TranslateResult>`

**Implementation**:
1. **Uses Gemini API** (same config as title cleaner):
   - `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_TITLE_CLEANING_ENABLED`, `AI_TITLE_CLEANING_TIMEOUT_MS`
   - In-memory cache with `AI_TITLE_CLEANING_CACHE_MAX` limit
2. **Prompt Instructions**:
   - Translate Korean product title to Mongolian (Cyrillic)
   - Remove promo/bundle text: 기획, 더블, 증정, 세트, 1+1, etc.
   - Keep only first size if multiple sizes exist (e.g., "40ml+40ml" → "40ml")
   - Return ONLY the Mongolian title text, no quotes, no markdown
3. **Response Cleaning**:
   - Defensively strips code fences (```mongolian ... ```)
   - Removes quotes if present
   - Returns plain text
4. **Fallback**:
   - If AI disabled or fails: returns minimal cleaned Korean title (removes promo patterns)
   - Uses simple regex-based cleaning as fallback

#### C) Automatic Translation

**1. On Product Import** (`apps/api/src/services/runImportService.ts`):
- Before bulkWrite, checks which products need translation (missing/empty `titleMn`)
- Translates in batches of 3 (limited concurrency)
- Stores translated `titleMn` in processed products
- Includes `titleMn` in bulkWrite `$set` operations

**2. On PATCH /api/products/:id** (`apps/api/src/routes/products.ts`):
- If `title` is updated and `titleMn` is NOT provided:
  - Auto-translates `titleMn` if it's missing/empty
  - Only translates if `AUTO_TRANSLATE_TITLE_MN=true` (default: true)
- If client provides `titleMn`, respects it (no auto-translation)

**3. Backfill Script** (`scripts/backfillTitleMn.ts`):
- Finds all products where `titleMn` is missing/empty
- Translates in batches with concurrency limit (3 at a time)
- Updates products with translated `titleMn`
- Shows progress and error summary

**Script Usage**:
```bash
pnpm backfill:titleMn
```

**Configuration**:
- `AUTO_TRANSLATE_TITLE_MN=true` (default: true, set to `false` to disable)
- Uses existing `GEMINI_API_KEY` and `GEMINI_MODEL`

#### D) Frontend UI Changes

**1. Product Detail** (`apps/web/src/pages/ProductDetail.tsx`):
- **Removed**:
  - "Auto-fill via AI" button
  - `brandEn` field (Brand English)
  - `modelEn` field (Model English)
  - `autofillProductTitle` import and related state
- **Updated**:
  - **Title (Mongolian)**: Main editable field (textarea, bound to `titleMn`)
  - Shows original Korean title as small read-only text below (if different from `titleMn`)
  - **Price**: Still editable
  - Save button PATCHes `{ titleMn, price }` (and optionally `title` if edited)

**2. Product List** (`apps/web/src/pages/ProductList.tsx`):
- **Main Title**: Shows `titleMn` if present, else falls back to Korean `title`
- **Subtitle**: Shows Korean `title` as italic text if `titleMn` exists and differs

#### E) API Changes

**Removed Endpoint**:
- `POST /api/products/:id/ai/autofill-title` (no longer needed)

**Updated Endpoint**:
- `PATCH /api/products/:id`:
  - Still accepts `brandEn`/`modelEn` (backward compatibility)
  - Auto-translates `titleMn` when `title` is updated (if `titleMn` not provided)

### Usage Flow

1. **On Import**:
   - Products are imported with Korean `title`
   - `titleMn` is automatically translated if missing
   - Translation happens in batches (3 at a time) before bulkWrite

2. **On Product Update**:
   - User edits `title` → `titleMn` is auto-translated (if missing)
   - User edits `titleMn` directly → translation is respected (no auto-translation)

3. **Backfill Existing Products**:
   - Run `pnpm backfill:titleMn` to translate all existing products
   - Processes in batches with progress logging

### Technical Notes

- **Caching**: Translation service uses same cache as title cleaner (shared `AI_TITLE_CLEANING_CACHE_MAX`)
- **Concurrency**: Import translation uses batches of 3 to avoid overwhelming API
- **Error Handling**: Translation failures are logged but don't block import/update
- **Backward Compatibility**: `brandEn`/`modelEn` remain in DB and API but are not used in UI
- **Idempotency**: Auto-translation only happens if `titleMn` is missing/empty
- **Configuration**: `AUTO_TRANSLATE_TITLE_MN=false` disables all auto-translation

### Results

- ✅ `titleMn` is automatically generated on import and title update
- ✅ No manual "Auto-fill" button needed
- ✅ English fields (`brandEn`/`modelEn`) removed from UI
- ✅ Product List shows Mongolian titles as primary
- ✅ Product Detail allows editing `titleMn` and shows Korean title as reference
- ✅ Backfill script available for existing products
- ✅ Backward compatible (DB schema unchanged)

---

## Automatic Image Enrichment on Import

### Problem
Products imported from local JSON or created manually often have no images. We needed automatic image enrichment for products with zero images (no `imagesProcessed` and no `imagesOriginal`).

### Solution Implemented

#### A) Configuration

**New Environment Variables** (`apps/api/.env.example`):
- `AUTO_ENRICH_IMAGES_ON_IMPORT=true` (default: true)
- `AUTO_ENRICH_IMAGES_TARGET=5` (default: 5)
- `AUTO_ENRICH_IMAGES_CONCURRENCY=2` (default: 2)
- `AUTO_ENRICH_IMAGES_MAX_PER_RUN=30` (default: 30)

**Updated Files**:
- `apps/api/src/config.ts` - Added parsing for new env variables with defaults

#### B) Auto-Enrichment Service

**New File**: `apps/api/src/services/autoImageEnricher.ts`

**Exports**:
- `type AutoEnrichResult = { checked: number; enriched: number; skipped: number; failed: number }`
- `async function autoEnrichImagesForProducts(products: ProductDoc[]): Promise<AutoEnrichResult>`

**Implementation**:
1. **Filtering**: Only processes products where `(imagesProcessed.length + imagesOriginal.length) === 0`
2. **Limiting**: Limits to `AUTO_ENRICH_IMAGES_MAX_PER_RUN` products per run
3. **Concurrency**: Uses `p-limit` with `AUTO_ENRICH_IMAGES_CONCURRENCY` (default: 2)
4. **Enrichment**: Calls existing `enrichProductImages()` with:
   - `desiredCount = AUTO_ENRICH_IMAGES_TARGET` (default: 5)
   - `force = false` (respects existing images)
5. **Safety Checks**:
   - Early return if `AUTO_ENRICH_IMAGES_ON_IMPORT=false`
   - Early return if `IMAGE_ENRICHMENT_ENABLED=false`
   - Continues on individual product failures (doesn't fail entire batch)
6. **Logging**: Logs summary stats (checked, enriched, skipped, failed)

#### C) Integration Points

**1. Import Service** (`apps/api/src/services/runImportService.ts`):
- After `bulkWrite` completes (both demo and real mode paths)
- Fetches affected products (inserted/updated) using `upsertedIds`
- Calls `autoEnrichImagesForProducts()` if products found
- Runs synchronously (blocks import completion)
- Errors are logged but don't fail the import

**2. Import Script** (`scripts/importProductsFilledGenerated.ts`):
- After `bulkWrite` completes
- Fetches affected products using `upsertedIds`
- Calls `autoEnrichImagesForProducts()` if products found
- Prints stats: `"📸 Auto image enrichment: checked=X, enriched=Y, skipped=Z, failed=N"`
- Errors are logged but don't fail the import

#### D) Behavior

**When Auto-Enrichment Runs**:
- ✅ After import from local JSON (`IMPORT_MODE=local`)
- ✅ After import via `/api/import/run` endpoint
- ✅ After bulk import via `importProductsFilledGenerated.ts` script
- ❌ Only for products with **zero images** (no `imagesProcessed` and no `imagesOriginal`)
- ❌ Does NOT enrich if product already has any images

**Safety Limits**:
- **Max per run**: 30 products (configurable via `AUTO_ENRICH_IMAGES_MAX_PER_RUN`)
- **Concurrency**: 2 products at a time (configurable via `AUTO_ENRICH_IMAGES_CONCURRENCY`)
- **Target count**: 5 images per product (configurable via `AUTO_ENRICH_IMAGES_TARGET`)
- **Timeouts**: Inherits from existing image downloader (10s per image)
- **Max file size**: Inherits from existing config (`IMAGE_MAX_BYTES`, default 5MB)

**Disabling**:
- Set `AUTO_ENRICH_IMAGES_ON_IMPORT=false` to disable completely
- Set `IMAGE_ENRICHMENT_ENABLED=false` to disable image enrichment entirely

#### E) Usage Flow

1. **Import Products**:
   - Products are imported/upserted via bulkWrite
   - System collects `upsertedIds` (inserted + updated product IDs)

2. **Auto-Enrichment Trigger**:
   - Fetches affected products from database
   - Filters to products with zero images
   - Limits to max per run (30)

3. **Enrichment Process**:
   - Processes products with concurrency limit (2 at a time)
   - Each product gets up to 5 images (target count)
   - Downloads images locally to `uploads/products/<productId>/<index>.jpg`
   - Updates `imagesProcessed` array

4. **Completion**:
   - Logs summary: checked, enriched, skipped, failed
   - Import completes (enrichment doesn't block)

### Technical Notes

- **Non-blocking**: Enrichment runs synchronously but errors don't fail the import
- **Idempotent**: Won't enrich products that already have images
- **Respects limits**: Max per run prevents overwhelming the system
- **Concurrency control**: Uses `p-limit` to avoid API rate limits
- **Error handling**: Individual product failures are logged but don't stop the batch
- **Support for lean documents**: Works with both Mongoose documents and lean queries

### Results

- ✅ Products with no images automatically get 4-5 images after import
- ✅ No manual intervention needed
- ✅ Safe limits prevent system overload
- ✅ Configurable via environment variables
- ✅ Works in both import service and import script
- ✅ Errors don't break the import process
- ✅ Only enriches products that truly need images (zero images)

### Example Output

```
✅ Import completed!
   Total in file: 100
   Matched: 50
   Inserted: 30
   Updated: 20
   Skipped: 0

📸 Auto image enrichment: checked=50, enriched=25, skipped=20, failed=5
```

## Demo Mode (Local JSON Import)

### Problem
Need a way to demonstrate the project "looks like it works" without requiring real web scraping. This is useful for demos, presentations, and development when internet access is limited or scraping is blocked.

### Solution Implemented

#### 1. Environment Configuration
Added three new environment variables to control demo mode:

- **`IMPORT_MODE`**: Set to `"demo"` to enable demo mode, or `"real"` (default) for normal web scraping
- **`LOCAL_PRODUCTS_JSON_PATH`**: Path to the local JSON file containing demo products (default: `"products_filled_generated.json"`)
- **`DEMO_DELAY_MS`**: Optional artificial delay in milliseconds to mimic network latency (default: `400ms`)

Updated `apps/api/src/config.ts` to parse these environment variables.

#### 2. Local Products Loader
Created `packages/core/src/demo/localProductsLoader.ts` with the following features:

**Functions**:
- `loadDemoProducts(filePath)`: Loads and caches products from JSON file (supports both `{ products: [...] }` and `[...]` shapes)
- `getDemoProductsForRequest({ store, categoryKey, limit, filePath, delayMs })`: Filters products by store and category, applies limit, and optionally adds delay
- `getDemoProductsMetadata(filePath)`: Returns metadata about loaded products (for status endpoint)

**Normalization**:
- Extracts URLs from markdown format `[text](url)`
- Normalizes protocol-relative URLs (`//example.com` → `https://example.com`)
- Normalizes image arrays using existing `normalizeImageUrls()` utility
- Handles price parsing (supports numbers, strings with commas/currency symbols)
- Validates required fields (store, sourceUrl, title)

**Filtering Logic**:
1. Filter by `store`
2. Filter by `categoryKey` (with fallback to store-only if no category matches)
3. Sort by `rank` if present
4. Apply `limit`
5. Optional delay to mimic network latency

**Caching**: Products are loaded once per process and cached in memory for performance.

#### 3. Demo Mode Integration
Updated `apps/api/src/services/runImportService.ts` to detect demo mode:

- **If `IMPORT_MODE === "demo"`**:
  - Loads products from local JSON using `getDemoProductsForRequest()`
  - Converts demo products to `ProcessedProduct` format
  - Skips web scraping, translation, and image processing (uses data from JSON)
  - Performs same MongoDB upsert with locked field protection
  - Returns same stats format (matched, inserted, updated, durationMs, upsertedIds)

- **If `IMPORT_MODE !== "demo"`**:
  - Uses existing real scraping behavior (unchanged)

**Idempotency**: Demo mode uses the same upsert key (`store + sourceUrl`) as real mode, ensuring no duplicates.

#### 4. Demo Status Endpoint
Created `GET /api/demo/status` endpoint (`apps/api/src/routes/demo.ts`):

**Response**:
```json
{
  "mode": "demo" | "real",
  "filePath": "products_filled_generated.json" | null,
  "loaded": true | false,
  "totalProducts": 90,
  "stores": ["oliveyoung", "gmarket", "11st"],
  "categories": ["ranking_all", "best_electronics_all", ...]
}
```

This helps quickly verify demo mode is active and shows what data is available.

#### 5. UI Badge
Added optional demo mode badge to the Web UI:

- **Location**: Header of `App.tsx` (next to title)
- **Display**: Only shows when `mode === "demo"` (fetched from `/api/demo/status`)
- **Styling**: Orange badge with "DEMO MODE (local JSON)" text
- **Tooltip**: Explains that products are loaded from local JSON file

Updated `apps/web/src/api/products.ts` to export `getDemoStatus()` function.

#### 6. Smoke Test Updates
Updated `scripts/smoke.mjs` to handle demo mode:

- Detects `IMPORT_MODE` environment variable
- In demo mode:
  - Tests `/api/demo/status` endpoint
  - Tests import with known store/category from JSON (e.g., `oliveyoung + ranking_all`)
  - Skips Gmarket tests (only JSON stores supported)
- In real mode:
  - Uses existing test behavior (unchanged)

#### 7. File Path Resolution
The loader automatically resolves JSON file paths:

- If absolute path: uses as-is
- If relative path: searches for repo root (by finding `package.json`) and resolves from there
- Fallback: resolves from current working directory

### Results
- ✅ Demo mode works end-to-end (UI shows products/images from local JSON)
- ✅ Import/run works with same API contract
- ✅ MongoDB upsert works with idempotency and locked field protection
- ✅ Real mode remains completely unchanged
- ✅ UI badge helps explain demo mode quickly
- ✅ Smoke tests validate demo mode functionality

### Usage

**Enable Demo Mode**:
```bash
# Set environment variable
export IMPORT_MODE=demo
export LOCAL_PRODUCTS_JSON_PATH=products_filled_generated.json
export DEMO_DELAY_MS=400

# Or in .env file
IMPORT_MODE=demo
LOCAL_PRODUCTS_JSON_PATH=products_filled_generated.json
DEMO_DELAY_MS=400
```

**Run Import in Demo Mode**:
1. Start API: `pnpm dev`
2. Open Web UI: `http://localhost:5173`
3. Run import from UI (e.g., `oliveyoung + ranking_all, limit 10`)
4. Products load from JSON file (no web scraping)

**Check Demo Status**:
```bash
curl http://localhost:3001/api/demo/status
```

**Run Smoke Tests in Demo Mode**:
```bash
IMPORT_MODE=demo pnpm run smoke
```

### Testing Recommendations
1. Run `pnpm build` to ensure no TypeScript errors
2. Set `IMPORT_MODE=demo` in environment
3. Start services: `docker compose up -d && pnpm dev`
4. Verify demo status: `curl http://localhost:3001/api/demo/status`
5. Run import from UI and confirm products show with images
6. Verify API response includes products: `curl "http://localhost:3001/api/products?limit=1"`
7. Test idempotency: run import again, should show "matched" and "updated" counts
8. Verify UI badge appears in header when demo mode is active

---

## Staged Import Workflow

### Problem
We needed a workflow where imported products are not immediately published to the main Products collection. Instead, products should be staged for review, with titles automatically translated to Mongolian during import, and only published after admin approval.

### Solution Implemented

#### A) Data Model: StagedProduct Collection

**New File**: `apps/api/src/models/StagedProduct.ts`

**Fields**:
- `store`, `categoryKey`, `topCategory`, `subCategory`
- `sourceUrl`, `externalId` (optional)
- `titleKo` (original Korean title)
- `titleMn` (translated Mongolian title, generated during import)
- `price`, `currency`
- `imagesOriginal`, `imagesProcessed` (optional)
- `status`: "staged" | "published"
- `importRunId` (string) to group items per run
- `createdAt`, `updatedAt`

**Indexes**:
- Unique compound index on `{ store: 1, sourceUrl: 1 }` for upsert deduplication
- Index on `{ status: 1, store: 1 }` for filtering

#### B) Import Flow Changes

**Updated File**: `apps/api/src/services/runImportService.ts`

**Changes**:
1. In local/demo mode, imports now create `StagedProduct` documents instead of `Product` documents
2. During import, each product's title is automatically translated to Mongolian using `translateTitleToMn()`
3. Staged products are upserted by `store + sourceUrl` to avoid duplicates
4. Import returns `{ staged: { stagedCount, importRunId } }` instead of product stats

**Key Implementation**:
- Translation happens during import (not deferred)
- No images are enriched during import (keeps import fast)
- Images can be enriched later from staged product detail page

#### C) Publish Action

**New Endpoint**: `POST /api/staged-products/:id/publish`

**Behavior**:
- Loads staged product by ID
- Creates/updates Product in main Products collection (upsert by `store + sourceUrl`)
- Copies all fields: `store`, `categoryKey`, `sourceUrl`, `title` (Korean), `titleMn`, `price`, `currency`, `imagesOriginal`, `imagesProcessed`, `descriptionOriginal`, `descriptionTranslated`
- Sets `status: "imported"` and adds note about publication
- Marks staged product `status: "published"`
- Returns published product DTO

**File**: `apps/api/src/routes/stagedProducts.ts`

#### D) Staged Products API

**New Endpoints**:
- `GET /api/staged-products?store=&status=staged&limit=&page=` - List staged products with pagination
- `GET /api/staged-products/:id` - Get single staged product
- `POST /api/staged-products/:id/publish` - Publish staged product to Products collection

**File**: `apps/api/src/routes/stagedProducts.ts`

**Response Format**:
- List endpoint returns `PaginatedResponse<StagedProductDTO>`
- Detail endpoint returns `StagedProductDTO`
- Publish endpoint returns `{ product: ProductDTO, message: string }`

#### E) Web UI

**New Pages**:
1. **StagedProductsList** (`apps/web/src/pages/StagedProductsList.tsx`):
   - Shows cards similar to products list
   - Filters: `status` (default: "staged"), `store`
   - Displays: thumbnail, titleMn (or titleKo), price, status badge, store
   - Pagination support

2. **StagedProductDetail** (`apps/web/src/pages/StagedProductDetail.tsx`):
   - Shows all product fields (titleKo read-only, titleMn editable, price editable)
   - Displays images (processed + original)
   - "Upload to DB" button (Publish action)
   - After publish: redirects to normal ProductDetail page for the published product

**Updated Files**:
- `apps/web/src/App.tsx` - Added routes for `/staged-products` and `/staged-products/:id`
- `apps/web/src/pages/ProductList.tsx` - Updated import handler to detect staged imports and navigate to staged products list
- `apps/web/src/api/products.ts` - Added `getStagedProducts()`, `getStagedProduct()`, `publishStagedProduct()` functions

**Import Flow**:
- User clicks "Run Import" button
- After import completes, if `staged.stagedCount > 0`, shows alert and navigates to `/staged-products`
- Otherwise, behaves as before (updates filters and refetches products)

#### F) Products List Behavior

**Unchanged**: Existing `/api/products` endpoint remains unchanged and reads from Products collection only. Staged products are NOT shown in the main products list until published.

#### G) Verification Steps

1. **Run Import**:
   - Execute import in local mode
   - Items appear in Staged Products list (`/staged-products`)
   - Items do NOT appear in main Products list

2. **Staged Product Detail**:
   - Open a staged product from the list
   - Verify `titleMn` is already filled (AI translated during import)
   - Verify `titleKo` is read-only
   - Verify price is editable

3. **Publish**:
   - Click "Upload to DB" button
   - Product is published to Products collection
   - Redirects to published product detail page
   - Product now appears in main Products list

### Technical Details

- **Translation**: Uses existing `translateTitleToMn()` service (Gemini API)
- **Idempotency**: Staged products are upserted by `store + sourceUrl`, so re-importing doesn't create duplicates
- **Status Tracking**: Staged products have `status: "staged"` or `status: "published"`
- **Import Run Grouping**: All staged products from the same import have the same `importRunId`

### Files Modified/Created

**Created**:
- `apps/api/src/models/StagedProduct.ts`
- `apps/api/src/routes/stagedProducts.ts`
- `apps/web/src/pages/StagedProductsList.tsx`
- `apps/web/src/pages/StagedProductsList.css`
- `apps/web/src/pages/StagedProductDetail.tsx`
- `apps/web/src/pages/StagedProductDetail.css`

**Modified**:
- `apps/api/src/services/runImportService.ts` - Changed to create StagedProduct in local mode
- `apps/api/src/routes/import.ts` - Returns staged count in response
- `apps/api/src/index.ts` - Added staged products router
- `apps/web/src/App.tsx` - Added routes for staged products
- `apps/web/src/pages/ProductList.tsx` - Updated import handler
- `apps/web/src/api/products.ts` - Added staged products API functions

---

## AI Translator Rate Limit Stabilization

### Problem
AI-based title translation/normalization was experiencing frequent `429` rate-limit failures during batch processing. This happened because:
1. **Parallel AI calls**: Batch operations (imports, backfills) were making many concurrent Gemini API calls using `Promise.all()`
2. **No retry logic**: Failed requests (429, 5xx, timeouts) immediately fell back without retrying
3. **No concurrency limiting**: Too many simultaneous requests overwhelmed the API rate limits
4. **No Retry-After support**: When Gemini returned `Retry-After` headers, they were ignored

### Solution Implemented

#### A) Retry Utility with Exponential Backoff

**New File**: `apps/api/src/utils/withRetry.ts`

**Features**:
- Retries only for retryable errors: `429`, `5xx`, network/timeout errors (no status)
- Bails immediately on non-retryable `4xx` errors (e.g., `400 Bad Request`)
- Respects `Retry-After` header (seconds or HTTP date format)
- Exponential backoff with jitter: `base = min(maxMs, minMs * 2^(attempt-1))`, `jitter = random(0..base*0.2)`
- Configurable retry max, backoff min/max
- Logs each retry attempt with status and wait time

**Usage**:
```ts
await withRetry(
  async () => callGeminiAPI(),
  {
    retryMax: 6,
    backoffMinMs: 500,
    backoffMaxMs: 20000,
    logger: (msg, meta) => console.warn(`[label] ${msg}`, meta),
    label: "gemini:serviceName",
  }
);
```

#### B) Concurrency Limiter

**New File**: `apps/api/src/utils/limitConcurrency.ts`

**Features**:
- Simple queue-based limiter (no external dependencies)
- Caps active promises to specified concurrency level
- Processes tasks in FIFO order
- Handles errors gracefully

**Usage**:
```ts
const limit = createLimiter(2); // max 2 concurrent
await limit(() => asyncTask());
```

#### C) Configuration

**Updated File**: `apps/api/src/config.ts`

**New Environment Variables**:
- `AI_TRANSLATOR_CONCURRENCY=2` (default: 2) - Max concurrent Gemini API calls
- `AI_TRANSLATOR_RETRY_MAX=6` (default: 6) - Max retry attempts
- `AI_TRANSLATOR_BACKOFF_MIN_MS=500` (default: 500) - Minimum backoff in milliseconds
- `AI_TRANSLATOR_BACKOFF_MAX_MS=20000` (default: 20000) - Maximum backoff in milliseconds

**Updated File**: `apps/api/.env.example`

Added all new environment variables with defaults.

#### D) Service Integration

**Updated Files**:
1. **`apps/api/src/services/titleMnTranslatorAI.ts`**:
   - Wrapped Gemini API call with `limit(() => withRetry(...))`
   - Shared limiter instance per process
   - Label: `gemini:titleMnTranslator`

2. **`apps/api/src/services/productTitleParserAI.ts`**:
   - Wrapped Gemini API call with `limit(() => withRetry(...))`
   - Label: `gemini:productTitleParser`

3. **`apps/api/src/services/titleCleanerAI.ts`**:
   - Wrapped Gemini API call with `limit(() => withRetry(...))`
   - Added defensive code fence stripping before JSON parse
   - Label: `gemini:titleCleaner`

**Key Implementation Details**:
- Each service creates a shared limiter: `const limit = createLimiter(config.aiTranslatorConcurrency)`
- AbortController timeout is still respected (wrapped inside retry)
- Fallback behavior preserved: if all retries fail, returns fallback result (no infinite loops)
- Logging: Each retry logs with service-specific label

#### E) Batch Processing Fixes

**Updated Files**:
1. **`apps/api/src/services/runImportService.ts`**:
   - Replaced batch processing with concurrency limiter
   - Changed from `Promise.all()` with manual batching to `limit()` wrapper
   - Uses `config.aiTranslatorConcurrency` for consistency

2. **`scripts/backfillTitleMn.ts`**:
   - Replaced `p-limit` with `createLimiter()` from utils
   - Uses `config.aiTranslatorConcurrency` instead of hardcoded `3`

**Pattern**:
```ts
const limit = createLimiter(config.aiTranslatorConcurrency);
const results = await Promise.all(
  items.map((item) => limit(() => translateFn(item)))
);
```

#### F) Unit Tests

**New Files**:
1. **`apps/api/src/utils/__tests__/withRetry.test.ts`**:
   - Tests: success on first attempt, retry on 429/5xx/network errors, bail on 400, throw after max retries
   - Uses Vitest

2. **`apps/api/src/utils/__tests__/limitConcurrency.test.ts`**:
   - Tests: concurrency cap enforcement, all tasks processed, error handling, minimum concurrency of 1

**Test Configuration**:
- Added `vitest` and `@types/node` to root devDependencies
- Created `vitest.config.ts` at root
- Added `"test": "vitest run"` script to root `package.json`

### Technical Details

**Retry Logic**:
- Retries: `429`, `500-599`, network/timeout errors
- No retry: Other `4xx` errors (bail immediately)
- Retry-After: Parses seconds (numeric) or HTTP date format
- Backoff: Exponential with 0-20% jitter, clamped to min/max

**Concurrency**:
- Default: 2 concurrent Gemini API calls
- Applied at service level (shared limiter per service)
- Also applied at batch level (additional limiter for batch operations)

**Logging**:
- Each retry logs: `[label] retry { attempt, status, waitMs }`
- Final failure logs: `[label] final fail { attempt, status }`
- Service-specific labels: `gemini:titleMnTranslator`, `gemini:productTitleParser`, `gemini:titleCleaner`

### Tuning Recommendations

If still experiencing `429` errors:
1. **Reduce concurrency**: Set `AI_TRANSLATOR_CONCURRENCY=1`
2. **Increase backoff**: Set `AI_TRANSLATOR_BACKOFF_MAX_MS=30000` (30 seconds)
3. **Increase retries**: Set `AI_TRANSLATOR_RETRY_MAX=10`

### Files Modified/Created

**Created**:
- `apps/api/src/utils/withRetry.ts`
- `apps/api/src/utils/limitConcurrency.ts`
- `apps/api/src/utils/__tests__/withRetry.test.ts`
- `apps/api/src/utils/__tests__/limitConcurrency.test.ts`
- `vitest.config.ts`

**Modified**:
- `apps/api/src/config.ts` - Added AI translator config vars
- `apps/api/src/services/titleMnTranslatorAI.ts` - Wrapped with retry + limiter
- `apps/api/src/services/productTitleParserAI.ts` - Wrapped with retry + limiter
- `apps/api/src/services/titleCleanerAI.ts` - Wrapped with retry + limiter, added code fence stripping
- `apps/api/src/services/runImportService.ts` - Fixed batch processing to use limiter
- `scripts/backfillTitleMn.ts` - Replaced p-limit with createLimiter
- `apps/api/.env.example` - Added new env vars
- `package.json` - Added test script and vitest devDependency

