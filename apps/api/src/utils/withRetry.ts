// apps/api/src/utils/withRetry.ts
import { setTimeout as sleep } from "node:timers/promises";

export type RetryOptions = {
  retryMax: number;
  backoffMinMs: number;
  backoffMaxMs: number;
  logger?: (msg: string, meta?: Record<string, unknown>) => void;
  label?: string;
};

type AnyErr = any;

function getStatus(err: AnyErr): number | undefined {
  return err?.response?.status ?? err?.status;
}

function getHeaders(err: AnyErr): Record<string, any> | undefined {
  return err?.response?.headers ?? err?.headers;
}

function isRetryable(err: AnyErr): boolean {
  const status = getStatus(err);
  if (status == null) return true; // network/timeout
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  if (status >= 400 && status <= 499) return false; // bail other 4xx
  return false;
}

function parseRetryAfterMs(headers?: Record<string, any>): number | undefined {
  if (!headers) return;
  const ra = headers["retry-after"] ?? headers["Retry-After"];
  if (!ra) return;

  // seconds
  const seconds = Number(ra);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  // HTTP date
  const dateMs = Date.parse(String(ra));
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    if (diff > 0) return diff;
  }
}

function backoffMs(attempt: number, minMs: number, maxMs: number): number {
  const exp = minMs * Math.pow(2, attempt - 1);
  const base = Math.min(maxMs, Math.max(minMs, exp));
  const jitter = Math.random() * base * 0.2; // 0..20%
  const wait = base + jitter;
  return Math.max(minMs, Math.min(maxMs, Math.floor(wait)));
}

export async function withRetry<T>(
  fn: (ctx: { attempt: number }) => Promise<T>,
  opts: RetryOptions
): Promise<T> {
  const {
    retryMax,
    backoffMinMs,
    backoffMaxMs,
    logger = (msg) => console.warn(msg),
    label = "withRetry",
  } = opts;

  let lastErr: AnyErr;

  for (let attempt = 1; attempt <= retryMax; attempt++) {
    try {
      return await fn({ attempt });
    } catch (err: AnyErr) {
      lastErr = err;

      const status = getStatus(err);
      const retryable = isRetryable(err);

      if (!retryable) {
        // bail on non-retryable 4xx
        throw err;
      }

      if (attempt >= retryMax) {
        logger(`[${label}] final fail`, { attempt, status });
        throw err;
      }

      const headers = getHeaders(err);
      const raMs = parseRetryAfterMs(headers);
      const waitMs = raMs ?? backoffMs(attempt, backoffMinMs, backoffMaxMs);

      logger(`[${label}] retry`, { attempt, status, waitMs });
      await sleep(waitMs);
    }
  }

  throw lastErr;
}

