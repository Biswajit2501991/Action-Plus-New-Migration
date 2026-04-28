import React from 'react';
import { buildWhatsAppUrl, renderTemplate } from '../features/messaging/engine.js';

export function useComposer(members, setWarn) {
  const [composer, setComposer] = React.useState({ memberId: '', body: '' });

  const openComposer = React.useCallback((memberId) => {
    const member = members.find((m) => m.memberId === memberId);
    if (!member) return;
    const template = 'Hello [CustomerName], welcome to Action Plus Gym.';
    const body = renderTemplate(template, member);
    setComposer({ memberId, body });
  }, [members]);

  const onComposerChange = React.useCallback((body) => {
    setComposer((c) => ({ ...c, body }));
  }, []);

  const sendWhatsApp = React.useCallback(() => {
    const member = members.find((m) => m.memberId === composer.memberId);
    if (!member) return;
    const url = buildWhatsAppUrl(member, composer.body);
    if (!url) return setWarn('Missing member mobile for WhatsApp.');
    window.open(url, '_blank');
  }, [composer.body, composer.memberId, members, setWarn]);

  return {
    composer,
    setComposer,
    openComposer,
    onComposerChange,
    sendWhatsApp
  };
}
