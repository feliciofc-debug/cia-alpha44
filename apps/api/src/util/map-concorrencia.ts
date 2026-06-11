/** Executa fn em paralelo com limite de concorrência; preserva ordem por índice. */
export async function mapComConcorrencia<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Math.min(Math.max(1, limit), items.length);

  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) break;
      out[i] = await fn(items[i]!, i);
    }
  }

  await Promise.all(Array.from({ length: workers }, worker));
  return out;
}
