/**
 * Sleep utility with optional jitter
 */
export function sleep(ms: number, jitter?: number): Promise<void> {
  const delay = jitter
    ? ms + Math.floor(Math.random() * (jitter * 2 + 1)) - jitter
    : ms;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Map items with concurrency limit
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const promise = Promise.resolve(fn(item, i)).then((result) => {
      results[i] = result;
    });

    executing.push(promise);

    if (executing.length >= limit) {
      await Promise.race(executing);
      executing.splice(
        executing.findIndex((p) => p === promise),
        1
      );
    }
  }

  await Promise.all(executing);
  return results;
}

