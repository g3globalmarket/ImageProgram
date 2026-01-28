import { describe, it, expect, vi, beforeEach } from "vitest";
import { withRetry } from "../withRetry";

describe("withRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should succeed on first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await withRetry(fn, {
      retryMax: 3,
      backoffMinMs: 10,
      backoffMaxMs: 100,
    });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on 429 and eventually succeed", async () => {
    let attempt = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt < 3) {
        const err: any = new Error("Rate limited");
        err.response = { status: 429 };
        throw err;
      }
      return Promise.resolve("success");
    });

    const result = await withRetry(fn, {
      retryMax: 6,
      backoffMinMs: 10,
      backoffMaxMs: 100,
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should retry on 5xx and eventually succeed", async () => {
    let attempt = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt < 2) {
        const err: any = new Error("Server error");
        err.response = { status: 500 };
        throw err;
      }
      return Promise.resolve("success");
    });

    const result = await withRetry(fn, {
      retryMax: 6,
      backoffMinMs: 10,
      backoffMaxMs: 100,
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should retry on network errors (no status)", async () => {
    let attempt = 0;
    const fn = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt < 2) {
        throw new Error("Network error");
      }
      return Promise.resolve("success");
    });

    const result = await withRetry(fn, {
      retryMax: 6,
      backoffMinMs: 10,
      backoffMaxMs: 100,
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should bail immediately on 400 (non-retryable 4xx)", async () => {
    const fn = vi.fn().mockImplementation(() => {
      const err: any = new Error("Bad request");
      err.response = { status: 400 };
      throw err;
    });

    await expect(
      withRetry(fn, {
        retryMax: 6,
        backoffMinMs: 10,
        backoffMaxMs: 100,
      })
    ).rejects.toThrow("Bad request");

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should throw after max retries", async () => {
    const fn = vi.fn().mockImplementation(() => {
      const err: any = new Error("Rate limited");
      err.response = { status: 429 };
      throw err;
    });

    await expect(
      withRetry(fn, {
        retryMax: 3,
        backoffMinMs: 10,
        backoffMaxMs: 100,
      })
    ).rejects.toThrow("Rate limited");

    expect(fn).toHaveBeenCalledTimes(3);
  });
});

