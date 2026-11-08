export function defaultSegments(min: number, max: number, count: number) {
  const lo = Math.min(100, Math.max(1, Math.round(min) || 5));
  const hi = Math.min(100, Math.max(lo, Math.round(max) || lo));
  const n = Math.min(12, Math.max(2, Math.round(count) || 6));
  return Array.from({ length: n }, (_, index) => {
    const discount = n === 1 ? lo : lo + Math.round(((hi - lo) * index) / (n - 1));
    return { label: `${discount}%`, discount, weight: 1 };
  });
}
