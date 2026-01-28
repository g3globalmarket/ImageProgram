# Korean Products MERN Monorepo

A production-oriented MERN (MongoDB + Express + React + Node.js) TypeScript monorepo for scraping products from Korean stores, translating descriptions, updating images with AI, and managing everything in MongoDB.

## Prerequisites

- **Node.js** LTS (v18 or higher)
- **pnpm** (v8 or higher) - Install with `npm install -g pnpm`
- **Docker** and **Docker Compose** (for MongoDB)

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Set Up Environment Variables

Create environment files from examples:

```bash
# Root .env (optional, mainly for documentation)
cp .env.example .env

# API .env (required)
cp apps/api/.env.example apps/api/.env
```

The `.env` files contain placeholder values. For now, you only need to ensure `MONGODB_URI` points to your local MongoDB (default: `mongodb://localhost:27017/products`).

### 3. Start MongoDB

```bash
docker compose up -d
```

This starts MongoDB on port `27017` with a persistent volume.

### 4. Run Development Servers

```bash
pnpm dev
```

This will start:
- **API server** on `http://localhost:3001`
- **Web frontend** on `http://localhost:5173`

### Admin Cleanup (Dev Only)

To remove stub/fake data from MongoDB (dev environment only):

1. **Dry run** (see what would be deleted):
   ```bash
   curl -X POST "http://localhost:3001/api/admin/cleanup/stub?dryRun=1" \
     -H "x-admin-token: YOUR_TOKEN"
   ```

2. **Execute cleanup**:
   ```bash
   curl -X POST "http://localhost:3001/api/admin/cleanup/stub" \
     -H "x-admin-token: YOUR_TOKEN"
   ```

Set `ADMIN_TOKEN` in your `.env` file (see `.env.example`).

**Note:** This endpoint is disabled in production (`NODE_ENV=production`).

## Project Structure

```
repo-root/
  apps/
    api/          # Express API server
    web/          # React frontend
  packages/
    shared/       # Shared types and zod schemas
    core/         # Pipeline interfaces and stub implementations
  docker/
    mongo/        # MongoDB Docker configuration
  docker-compose.yml
  turbo.json      # Turborepo configuration
  pnpm-workspace.yaml
```

## Available Scripts

### Root Level

- `pnpm dev` - Start all apps in development mode
- `pnpm build` - Build all packages and apps
- `pnpm lint` - Lint all packages and apps
- `pnpm format` - Format code with Prettier
- `pnpm typecheck` - Type-check all TypeScript code

### Individual Packages

Each package/app has its own scripts:
- `dev` - Development mode with hot reload
- `build` - Build for production
- `lint` - Lint code
- `typecheck` - Type-check TypeScript

## API Endpoints

### Health Check

- `GET /health` - Returns `{ ok: true }`

### Products

- `GET /api/products` - List products with pagination
  - Query params: `page`, `limit`, `sort`
- `GET /api/products/:id` - Get single product
- `PATCH /api/products/:id` - Update product fields
  - Allowed fields: `title`, `price`, `descriptionTranslated`, `imagesProcessed`, `status`, `notes`

### Import

- `POST /api/import/run` - Run import pipeline
  - Body:
    ```json
    {
      "store": "gmarket" | "11st" | "oliveyoung",
      "categoryKey": "string",
      "limit": number,
      "translateTo": "string (2 chars, e.g. 'mn')",
      "imageMode": "none" | "search" | "generate"
    }
    ```

## Offline Demo Mode

The project supports **offline demo mode** that loads products from a local JSON file instead of web scraping. This is perfect for demos, presentations, or development when internet access is limited.

### Setup

1. **Set environment variables** (in `apps/api/.env` or root `.env`):
   ```bash
   IMPORT_MODE=local
   LOCAL_PRODUCTS_FILE=products_filled_generated.json
   ```

2. **Ensure the JSON file exists** at the specified path (default: `products_filled_generated.json` in repo root).

3. **Start services**:
   ```bash
   docker compose up -d  # Start MongoDB
   pnpm dev              # Start API + Web UI
   ```

### Using Offline Demo Mode

1. **Open the web UI** at `http://localhost:5173`
2. **Click "Run Import"**
3. **Select a store** (e.g., `oliveyoung`, `gmarket`, `11st`)
4. **Categories are loaded dynamically** from the JSON file:
   - Select a top category (optional)
   - Select a sub category (optional)
   - Choose a category key
5. **Set the limit** (number of products to import)
6. **Click "Run Import"**
7. **Products appear** in the list with images, titles, and prices

### How It Works

- **Source of Truth**: `products_filled_generated.json` contains all product data
- **Dynamic Categories**: Categories are extracted from the JSON file based on `store`, `topCategory`, `subCategory`, and `categoryKey` fields
- **Filtering**: Products are filtered by store and categoryKey (or topCategory + subCategory)
- **No Web Scraping**: All data comes from the local JSON file
- **Same API Contract**: The import endpoint works the same way, just loads from JSON instead of scraping

### Example Import Flow

```bash
# 1. Start services
docker compose up -d
pnpm dev

# 2. Open browser: http://localhost:5173

# 3. In UI:
#    - Select store: "oliveyoung"
#    - Select categoryKey: "ranking_all"
#    - Set limit: 10
#    - Click "Run Import"

# 4. Products appear in the list with images
```

### Switching Back to Real Mode

To use real web scraping instead:
```bash
IMPORT_MODE=real pnpm dev
```

## Running an Import (Real Mode)

1. Open the web UI at `http://localhost:5173`
2. Click "Run Import"
3. Fill in the form:
   - Select a store (gmarket, 11st, or oliveyoung)
   - Enter a category key (e.g., "electronics")
   - Set the limit (number of products to import)
   - Set translation target language (e.g., "mn")
   - Choose image mode (none, search, or generate)
4. Click "Run Import"
5. The products will appear in the list after import completes

## Current Implementation Status

### Step 1 (Current)

- ✅ Monorepo structure with Turborepo
- ✅ TypeScript everywhere
- ✅ MongoDB with Mongoose
- ✅ Express API with all required endpoints
- ✅ React frontend with product list and import form
- ✅ Stub implementations for scraper, translator, and image provider
- ✅ Docker setup for MongoDB
- ✅ Shared types and validation schemas

### Future Steps

- Real web scraping implementations
- Google Cloud Translation integration
- Image search/generation with AI
- Enhanced error handling and retry logic
- Product image processing pipeline

## Environment Variables

### API (`apps/api/.env`)

- `MONGODB_URI` - MongoDB connection string (default: `mongodb://localhost:27017/products`)
- `PORT` - API server port (default: `3001`)
- `CORS_ORIGIN` - Allowed CORS origin (default: `http://localhost:5173`)
- `GOOGLE_CLOUD_API_KEY` - Placeholder for future Google Cloud Translation
- `CUSTOM_SEARCH_ENGINE_ID` - Placeholder for future image search
- `IMAGE_PROVIDER` - Image provider type (default: `custom_search`)
- `TRANSLATION_PROVIDER` - Translation provider type (default: `google_api_key`)

## Troubleshooting

### MongoDB Connection Issues

- Ensure Docker is running: `docker ps`
- Check MongoDB container: `docker compose ps`
- View MongoDB logs: `docker compose logs mongo`
- Restart MongoDB: `docker compose restart mongo`

### Port Already in Use

- Change API port in `apps/api/.env` (PORT)
- Change web port in `apps/web/vite.config.ts` (server.port)

### Build Errors

- Clean and reinstall: `rm -rf node_modules && pnpm install`
- Clear Turbo cache: `rm -rf .turbo`
- Rebuild packages: `pnpm build`

## Image Enrichment

The project includes an automatic image enrichment feature that finds and downloads 4-5 relevant images per product using Google Custom Search.

### Setup

1. **Get Google Custom Search credentials**:
   - Create a Custom Search Engine at https://programmablesearchengine.google.com/
   - Enable "Image search" in settings
   - Get your `CUSTOM_SEARCH_ENGINE_ID` (CX)
   - Ensure you have a `GOOGLE_CLOUD_API_KEY` with Custom Search API enabled

2. **Configure environment variables** (in `apps/api/.env`):
   ```bash
   GOOGLE_CLOUD_API_KEY=your_api_key_here
   CUSTOM_SEARCH_ENGINE_ID=your_cx_here
   IMAGE_ENRICHMENT_ENABLED=true
   IMAGE_DOWNLOAD_DIR=uploads/products
   PUBLIC_IMAGE_BASE_URL=/uploads/products
   IMAGE_TARGET_COUNT=5
   IMAGE_MAX_BYTES=5000000
   IMAGE_CONCURRENCY=3
   ```

### Usage

1. **Import products** (via UI or API)
2. **Enrich images**:
   - Click "Enrich Images" button in the Products page
   - Or use API: `POST /api/images/enrich-batch` with `{ "store": "oliveyoung", "limit": 20 }`
3. **Images are downloaded locally** to `apps/api/uploads/products/<productId>/`
4. **Images are served statically** at `/uploads/products/<productId>/<index>.jpg`
5. **Products are updated** with local image URLs in `imagesProcessed`

### API Endpoints

- `POST /api/images/enrich-one` - Enrich images for a single product
  ```json
  {
    "productId": "...",
    "desiredCount": 5,
    "force": false
  }
  ```

- `POST /api/images/enrich-batch` - Enrich images for multiple products
  ```json
  {
    "store": "oliveyoung",
    "limit": 20,
    "desiredCount": 5,
    "force": false
  }
  ```

### How It Works

1. **Checks existing images**: Uses `imagesProcessed + imagesOriginal` to count existing images
2. **Searches for images**: Uses Google Custom Search with query `${brand} ${title}` (or `${title} oliveyoung` for OliveYoung products)
3. **Filters candidates**: Removes duplicates and non-image URLs
4. **Downloads images**: 
   - Validates content-type and file size
   - Downloads with 10s timeout
   - Resizes to max 1024px width using Sharp
   - Converts to JPEG (quality 85)
   - Saves to `uploads/products/<productId>/<index>.jpg`
5. **Updates product**: Adds local URLs to `imagesProcessed` array

### Safety Features

- **Content-type validation**: Only downloads files with `image/*` content-type
- **File size limit**: Default 5MB max per image
- **Timeout protection**: 10s timeout per download
- **Concurrency limit**: Default 3 concurrent downloads
- **Idempotent**: Won't re-download if product already has enough images (unless `force=true`)
- **Error handling**: Continues processing even if individual downloads fail

### Image Storage

- **Location**: `apps/api/uploads/products/<productId>/<index>.jpg`
- **Public URL**: `/uploads/products/<productId>/<index>.jpg`
- **Format**: JPEG, max 1024px width, quality 85
- **Naming**: Sequential index (0.jpg, 1.jpg, etc.)

## License

Private project - All rights reserved

