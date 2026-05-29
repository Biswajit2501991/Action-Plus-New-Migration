import { Router } from 'express';
import {
  listBranchBrandingForAuth,
  resolveBrandingForAuth,
  updateBranchBranding,
  uploadBranchBrandingLogo,
} from '../tenant/branding/BranchScopedBrandingService.js';

const router = Router();

router.get('/active', async (req, res) => {
  try {
    const branding = await resolveBrandingForAuth(req.auth);
    res.json({ ok: true, branding });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'branding-active-failed' });
  }
});

router.get('/branches', async (req, res) => {
  try {
    const branches = await listBranchBrandingForAuth(req.auth);
    res.json({ ok: true, branches });
  } catch (err) {
    res.status(500).json({ error: 'branding-list-failed', message: err.message });
  }
});

router.get('/branch/:gymCodeId', async (req, res) => {
  try {
    const branding = await resolveBrandingForAuth(req.auth, req.params.gymCodeId);
    res.json({ ok: true, branding });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'branding-read-failed' });
  }
});

router.patch('/branch/:gymCodeId', async (req, res) => {
  try {
    const branding = await updateBranchBranding(req.auth, req.params.gymCodeId, {
      displayName: req.body?.displayName ?? req.body?.display_name,
      clearLogo: Boolean(req.body?.clearLogo),
    });
    res.json({ ok: true, branding });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'branding-update-failed' });
  }
});

router.post('/branch/:gymCodeId/logo', async (req, res) => {
  try {
    const raw = req.body?.logo || req.body?.dataUrl || req.body?.image;
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ error: 'logo-data-required' });
    }
    const match = raw.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
    const mime = match ? match[1].toLowerCase() : 'image/png';
    const b64 = match ? match[2] : raw;
    const buffer = Buffer.from(b64, 'base64');
    const branding = await uploadBranchBrandingLogo(req.auth, req.params.gymCodeId, { buffer, mime });
    res.json({ ok: true, branding });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'branding-logo-upload-failed' });
  }
});

export default router;
