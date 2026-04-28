import React from 'react';

export default function AppHeaderModule({ apiMode, health, toast, warn }) {
  return (
    <>
      <h1>Action Plus Gym - Phase 1.2 Modular Shell</h1>
      <p>API mode: {apiMode} | Health: {health}</p>
      {toast && <p style={{ color: '#166534' }}>{toast}</p>}
      {warn && <p style={{ color: '#b91c1c' }}>{warn}</p>}
    </>
  );
}
