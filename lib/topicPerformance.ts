type Performance = { correct: number; total: number };

export function topicScore(performance?: Performance): number {
  if (!performance || performance.total <= 0) return -1;
  return performance.correct / performance.total;
}

export function rankTopics<T extends { key: string }>(
  topics: readonly T[],
  performance: Record<string, Performance>,
): T[] {
  return [...topics].sort((a, b) => topicScore(performance[b.key]) - topicScore(performance[a.key]));
}
