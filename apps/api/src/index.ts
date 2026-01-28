import express from "express";
import cors from "cors";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { connectDatabase } from "./db/connection";
import { config } from "./config";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import healthRouter from "./routes/health";
import productsRouter from "./routes/products";
import importRouter from "./routes/import";
import importRunsRouter from "./routes/importRuns";
import importJobsRouter from "./routes/importJobs";
import queueRouter from "./routes/queue";
import cacheRouter from "./routes/cache";
import readyRouter from "./routes/ready";
import storesRouter from "./routes/stores";
import configRouter from "./routes/config";
import adminCleanupRouter from "./routes/adminCleanup";
import demoRouter from "./routes/demo";
import metaRouter from "./routes/meta";
import imagesRouter from "./routes/images";
import stagedProductsRouter from "./routes/stagedProducts";
import { startImportWorker } from "./queue/importWorker";

const app = express();

// Middleware
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = join(process.cwd(), config.imageDownloadDir);
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

// Serve static files for uploaded images
app.use(
  config.publicImageBaseUrl,
  express.static(join(process.cwd(), config.imageDownloadDir))
);

// Routes
app.use("/health", healthRouter);
app.use("/api/config", configRouter);
app.use("/api/stores", storesRouter);
app.use("/api/products", productsRouter);
app.use("/api/import", importRouter);
app.use("/api/import/runs", importRunsRouter);
app.use("/api/import/jobs", importJobsRouter);
app.use("/api/queue", queueRouter);
app.use("/api/cache", cacheRouter);
app.use("/api/ready", readyRouter);
app.use("/api/admin/cleanup", adminCleanupRouter);
app.use("/api/demo", demoRouter);
app.use("/api/meta", metaRouter);
app.use("/api/images", imagesRouter);
app.use("/api/staged-products", stagedProductsRouter);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
async function start() {
  await connectDatabase();

  app.listen(config.port, () => {
    console.log(`🚀 API server running on http://localhost:${config.port}`);
    
    // Start import worker if async enabled
    if (config.importAsyncEnabled) {
      startImportWorker();
    }
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});

