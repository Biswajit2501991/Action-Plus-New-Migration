/** In-process SSE fan-out for live sync notifications. */

const clients = new Set();
const debounceTimers = new Map();

export function addSseClient(res) {
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

export function broadcastChange(collection, meta = {}) {
  const key = String(collection || '');
  if (!key) return;
  if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key));
  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key);
      const payload = JSON.stringify({
        collection: key,
        at: Date.now(),
        ...meta,
      });
      const frame = `data: ${payload}\n\n`;
      for (const client of clients) {
        try {
          client.write(frame);
        } catch {
          clients.delete(client);
        }
      }
    }, 120),
  );
}

export function sseClientCount() {
  return clients.size;
}
