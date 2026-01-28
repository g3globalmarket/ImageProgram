import { describe, it, expect, vi } from "vitest";
import { createLimiter } from "../limitConcurrency";

describe("createLimiter", () => {
  it("should limit concurrency to specified value", async () => {
    const limit = createLimiter(2);
    let active = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 5 }, (_, i) =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 50));
        active--;
        return i;
      })
    );

    await Promise.all(tasks);

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(tasks.length).toBe(5);
  });

  it("should process all tasks", async () => {
    const limit = createLimiter(2);
    const results: number[] = [];

    const tasks = Array.from({ length: 5 }, (_, i) =>
      limit(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(i);
        return i;
      })
    );

    const resolved = await Promise.all(tasks);

    expect(resolved).toHaveLength(5);
    expect(results).toHaveLength(5);
  });

  it("should handle errors", async () => {
    const limit = createLimiter(2);
    const tasks = [
      limit(async () => {
        throw new Error("Task failed");
      }),
      limit(async () => "success"),
    ];

    await expect(tasks[0]).rejects.toThrow("Task failed");
    await expect(tasks[1]).resolves.toBe("success");
  });

  it("should enforce minimum concurrency of 1", async () => {
    const limit = createLimiter(0);
    let active = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 3 }, () =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active--;
      })
    );

    await Promise.all(tasks);

    expect(maxActive).toBeLessThanOrEqual(1);
  });
});

