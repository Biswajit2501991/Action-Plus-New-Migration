/**
 * Staff confirmation when changing a paid-for-month ledger amount that already exists.
 * @returns {Promise<{ confirmed: boolean, reason: string }>}
 */
export function confirmPaidForMonthAmountOverride({
  paidForMonth = '',
  existingAmount = 0,
  newAmount = 0,
} = {}) {
  if (typeof document === 'undefined') {
    return Promise.resolve({ confirmed: false, reason: '' });
  }
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'presentation');
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:10050',
      'background:rgba(0,0,0,0.45)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'padding:16px',
    ].join(';');

    const panel = document.createElement('div');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'apg-paid-month-override-title');
    panel.style.cssText = [
      'background:#fff',
      'color:#111',
      'max-width:420px',
      'width:100%',
      'border-radius:12px',
      'padding:20px',
      'box-shadow:0 12px 40px rgba(0,0,0,0.2)',
      'font-family:system-ui,sans-serif',
    ].join(';');

    const title = document.createElement('h2');
    title.id = 'apg-paid-month-override-title';
    title.textContent = 'Revenue record already exists';
    title.style.cssText = 'margin:0 0 12px;font-size:18px;font-weight:600';

    const body = document.createElement('div');
    body.style.cssText = 'font-size:14px;line-height:1.5;margin-bottom:12px';
    body.innerHTML = [
      `<div><strong>Paid Month:</strong> ${escapeHtml(String(paidForMonth))}</div>`,
      `<div><strong>Existing Amount:</strong> ₹${formatAmount(existingAmount)}</div>`,
      `<div><strong>New Amount:</strong> ₹${formatAmount(newAmount)}</div>`,
      '<p style="margin:12px 0 0">Do you want to override this value?</p>',
    ].join('');

    const reasonLabel = document.createElement('label');
    reasonLabel.textContent = 'Reason (optional)';
    reasonLabel.style.cssText = 'display:block;font-size:12px;margin-bottom:4px;color:#444';

    const reasonInput = document.createElement('textarea');
    reasonInput.rows = 2;
    reasonInput.placeholder = 'e.g. discount correction';
    reasonInput.style.cssText = 'width:100%;box-sizing:border-box;margin-bottom:16px;padding:8px;border:1px solid #ccc;border-radius:6px;font-size:14px';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';

    const finish = (confirmed, reason) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve({ confirmed, reason: String(reason || '').trim() });
    };

    const noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.textContent = 'No — Keep Existing';
    noBtn.style.cssText = 'padding:8px 14px;border:1px solid #ccc;border-radius:8px;background:#f5f5f5;cursor:pointer';
    noBtn.onclick = () => finish(false, '');

    const yesBtn = document.createElement('button');
    yesBtn.type = 'button';
    yesBtn.textContent = 'Yes — Update';
    yesBtn.style.cssText = 'padding:8px 14px;border:none;border-radius:8px;background:#0d6efd;color:#fff;cursor:pointer';
    yesBtn.onclick = () => finish(true, reasonInput.value);

    const onKey = (ev) => {
      if (ev.key === 'Escape') finish(false, '');
    };
    document.addEventListener('keydown', onKey);
    overlay.onclick = (ev) => {
      if (ev.target === overlay) finish(false, '');
    };

    actions.append(noBtn, yesBtn);
    panel.append(title, body, reasonLabel, reasonInput, actions);
    overlay.append(panel);
    document.body.appendChild(overlay);
    yesBtn.focus();
  });
}

function formatAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
