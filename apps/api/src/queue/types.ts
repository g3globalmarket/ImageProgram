import type { ImportRunRequest } from "@repo/shared";

export type ImportJobPayload = {
  request: ImportRunRequest;
  requestedAt: string;
};

export type ImportJobProgress = {
  stage: "queued" | "starting" | "scraping" | "details" | "translating" | "images" | "db_upsert" | "done" | "failed";
  runId?: string;
  stats?: {
    matched: number;
    inserted: number;
    updated: number;
    durationMs: number;
    upsertedIds: string[];
  };
  error?: string;
};

