/**
 * Maps bare `import ... from 'react-dom'` to the UMD bundle on window.
 */
const RD = globalThis.ReactDOM;
if (!RD) {
  throw new Error('Load vendor/react-dom.development.js before react-dom-esm-shim.js');
}
export default RD;
