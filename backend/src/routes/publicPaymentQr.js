import { Router } from 'express';
import { renderPublicPaymentQrHtml } from '../services/paymentQr/paymentQrPublicView.js';

const router = Router();

router.get('/:gymCode/view', async (req, res) => {
  const gymCode = String(req.params?.gymCode || '').trim();
  if (!gymCode) return res.status(400).send('Gym code is required.');
  try {
    const html = await renderPublicPaymentQrHtml(gymCode);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).send(html);
  } catch (err) {
    const status = err?.status || 500;
    if (status === 404) return res.status(404).send('Payment QR not found for this branch.');
    return res.status(500).send('Unable to load payment QR page.');
  }
});

export default router;
