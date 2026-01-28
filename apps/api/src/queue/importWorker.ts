import { Worker } from "bullmq";
import { IMPORT_QUEUE_NAME } from "./importQueue";
import type { ImportJobPayload, ImportJobProgress } from "./types";
import { runImportService } from "../services/runImportService";
import { config } from "../config";

let importWorker: Worker<ImportJobPayload, { runId: string; stats: any }> | null = null;

export function startImportWorker(): void {
  if (!config.importAsyncEnabled) {
    console.log("[Worker] Async imports disabled, worker not started");
    return;
  }

  if (importWorker) {
    console.log("[Worker] Import worker already started");
    return;
  }

  importWorker = new Worker<ImportJobPayload, { runId: string; stats: any }>(
    IMPORT_QUEUE_NAME,
    async (job) => {
      const { request } = job.data;

      try {
        // Update progress: starting
        await job.updateProgress({
          stage: "starting",
        } as ImportJobProgress);

        // Update progress: scraping
        await job.updateProgress({
          stage: "scraping",
        } as ImportJobProgress);

        // Run import service
        const result = await runImportService({
          request,
          envConfig: config,
        });

        // Update progress: done
        await job.updateProgress({
          stage: "done",
          runId: result.runId,
          stats: result.stats,
        } as ImportJobProgress);

        return {
          runId: result.runId,
          stats: result.stats,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        // Update progress: failed
        await job.updateProgress({
          stage: "failed",
          error: errorMessage,
        } as ImportJobProgress);

        throw error;
      }
    },
    {
      connection: {
        host: "localhost",
        port: 6379,
      },
      concurrency: config.importJobConcurrency,
      limiter: {
        max: config.importJobConcurrency,
        duration: 1000,
      },
    }
  );

  importWorker.on("completed", (job) => {
    if (config.debugQueue) {
      console.log(`[Worker] Job ${job.id} completed`);
    }
  });

  importWorker.on("failed", (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err);
  });

  importWorker.on("error", (err) => {
    console.error("[Worker] Worker error:", err);
  });

  console.log(
    `[Worker] Import worker started with concurrency ${config.importJobConcurrency}`
  );
}

export function stopImportWorker(): Promise<void> {
  if (importWorker) {
    return importWorker.close();
  }
  return Promise.resolve();
}

