import React from 'react';
import { WHATSAPP_VARIABLES } from '../features/messaging/engine.js';

export default function WhatsAppSmsPageModule({ composer, onComposerChange, onSendWhatsApp }) {
  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginTop: 16 }}>
      <h2>Messaging (variables + preview)</h2>
      <p style={{ fontSize: 12 }}>Variables: {WHATSAPP_VARIABLES.join(', ')}</p>
      <textarea
        value={composer.body}
        onChange={(e) => onComposerChange(e.target.value)}
        rows={6}
        style={{ width: '100%' }}
      />
      <div style={{ marginTop: 8 }}>
        <button onClick={onSendWhatsApp} disabled={!composer.memberId}>Send WhatsApp</button>
      </div>
    </section>
  );
}
