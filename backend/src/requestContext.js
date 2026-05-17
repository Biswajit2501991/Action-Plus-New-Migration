import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();

/** @returns {string | undefined} */
export function getRequestGymId() {
  return store.getStore()?.gymId;
}

/**
 * @param {{ gymId: string }} ctx
 * @param {() => void} fn
 */
export function runWithGymContext(ctx, fn) {
  return store.run(ctx, fn);
}
