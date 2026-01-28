// apps/api/src/utils/limitConcurrency.ts
export function createLimiter(concurrency: number) {
  const cap = Math.max(1, Math.floor(concurrency || 1));
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active >= cap) return;
    const run = queue.shift();
    if (!run) return;
    run();
  };

  return function limit<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        task()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            active--;
            next();
          });
      };

      queue.push(run);
      next();
    });
  };
}

