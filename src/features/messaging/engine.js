import { addMonths, asUTC, fmt } from '../../lib/utils.js';

export const WHATSAPP_VARIABLES = [
  '[CustomerName]',
  '[PLAN]',
  '[CurrentPlan]',
  '[Amount]',
  '[BillingDate]',
  '[PaymentBy]',
  '[GymStartdate]',
  '[NextPaymentDate]',
];

export function renderTemplate(template, member, now = new Date()) {
  if (!template) return '';
  const billing = asUTC(member?.billingDate);
  const paymentBy = asUTC(member?.paymentBy || member?.billingDate);
  const replacements = {
    '[Name]': member?.name || '',
    '[CustomerName]': member?.name || '',
    '[PLAN]': member?.plan || '',
    '[CurrentPlan]': member?.plan || '',
    '[Amount]': `${Number(member?.amount || 0)}`,
    '[BillingDate]': billing ? fmt(billing) : '',
    '[DATE]': billing ? fmt(billing) : '',
    '[GymStartdate]': member?.joiningDate ? fmt(member.joiningDate) : '',
    '[LastDate]': paymentBy ? fmt(paymentBy) : '',
    '[PaymentBy]': paymentBy ? fmt(paymentBy) : '',
    '[HoldDate]': fmt(now),
    '[HoldMonth]': member?.holdDuration || '1 Month',
    '[TodaysDate]': fmt(now),
    '[NextBillingDate]': billing ? fmt(addMonths(billing, 1)) : '',
    '[NextPaymentDate]': paymentBy ? fmt(paymentBy) : '',
    '[ModeOfPayment]': member?.paymentMethod || '',
  };
  let output = template;
  Object.keys(replacements).forEach((key) => {
    output = output.split(key).join(replacements[key]);
  });
  return output;
}

export function buildWhatsAppUrl(member, text) {
  const cleanPhone = String(member?.mobile || '').replace(/\D/g, '');
  if (!cleanPhone) return '';
  const finalPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  return `https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodeURIComponent(text || '')}`;
}

export function appendMessageHistory(member, entry) {
  const current = Array.isArray(member?.messageHistory) ? member.messageHistory : [];
  return [{ id: crypto.randomUUID(), ts: new Date().toISOString(), ...entry }, ...current].slice(0, 50);
}
