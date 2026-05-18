/** Same format as legacy index.html: V- + last 8 digits of timestamp. */
export function createVisitorId(existingIds: Iterable<string> = []): string {
  const taken = new Set(existingIds);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = String(Date.now() + attempt).slice(-8);
    const id = `V-${suffix}`;
    if (!taken.has(id)) return id;
  }
  const fallback = String(Date.now()).slice(-8);
  return `V-${fallback}`;
}
