import { Queue } from "bullmq";
import type { ImportJobPayload } from "./types";
import { config } from "../config";

export const IMPORT_QUEUE_NAME = "import-jobs";

let importQueue: Queue<ImportJobPayload, any, string> | null = null;

export function getImportQueue(): Queue<ImportJobPayload, any, string> {
  if (!importQueue) {
    importQueue = new Queue<ImportJobPayload, any, string>(IMPORT_QUEUE_NAME, {
      connection: {
        host: "localhost",
        port: 6379,
      },
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: {
          age: 24 * 3600, // Keep completed jobs for 24 hours
          count: 100, // Keep max 100 completed jobs
        },
        removeOnFail: {
          age: 7 * 24 * 3600, // Keep failed jobs for 7 days
        },
      },
    });
  }
  return importQueue;
}

export async function enqueueImportJob(
  payload: ImportJobPayload
): Promise<{ jobId: string }> {
  const queue = getImportQueue();
  const job = await queue.add("import", payload, {
    jobId: `import-${Date.now()}-${Math.random().toString(36).substring(7)}`,
  });
  return { jobId: job.id! };
}

export async function closeImportQueue(): Promise<void> {
  if (importQueue) {
    await importQueue.close();
    importQueue = null;
  }
}

