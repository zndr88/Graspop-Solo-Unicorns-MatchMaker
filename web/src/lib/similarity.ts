export function jaccardMatchPct(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;

  let intersection = 0;
  for (const x of setA) {
    if (setB.has(x)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;
  return (intersection / union) * 100;
}

export function sharedBands(a: string[], b: string[], limit = 5): string[] {
  const setB = new Set(b);
  const shared: string[] = [];
  for (const x of a) {
    if (setB.has(x)) shared.push(x);
    if (shared.length >= limit) break;
  }
  return shared;
}

