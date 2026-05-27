/**
 * Maps `import ... from 'react-dom/client'` to React 18 UMD createRoot API.
 */
const RD = globalThis.ReactDOM;
if (!RD || typeof RD.createRoot !== 'function') {
  throw new Error('Load vendor/react-dom.development.js before react-dom-client-esm-shim.js');
}
export const createRoot = RD.createRoot.bind(RD);
export const hydrateRoot = RD.hydrateRoot?.bind(RD) || RD.createRoot.bind(RD);
