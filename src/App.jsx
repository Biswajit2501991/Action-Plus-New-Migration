import React from 'react';
import { createApiClient } from './services/apiClient.js';

// Migration scaffold:
// This modular shell is intentionally minimal so the current index.html app
// can continue running while features are incrementally ported.
export default function App() {
  const apiMode = 'local';
  const api = React.useMemo(() => createApiClient(apiMode), [apiMode]);
  const [health, setHealth] = React.useState('checking');

  React.useEffect(() => {
    let mounted = true;
    api.health().then(() => mounted && setHealth('ok')).catch(() => mounted && setHealth('error'));
    return () => {
      mounted = false;
    };
  }, [api]);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Action Plus Gym - Modular App Scaffold</h1>
      <p>API mode: {apiMode}</p>
      <p>Health: {health}</p>
      <p>Next step: migrate features from index.html into modules.</p>
    </div>
  );
}
