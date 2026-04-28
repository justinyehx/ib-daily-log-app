export async function runTimed<T>(label: string, task: () => Promise<T>) {
  const startedAt = Date.now();

  try {
    const result = await task();
    if (process.env.NODE_ENV !== "production") {
      console.info(`[perf] ${label}: ${Date.now() - startedAt}ms`);
    }
    return result;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error(`[perf] ${label} failed after ${Date.now() - startedAt}ms`, error);
    }
    throw error;
  }
}
