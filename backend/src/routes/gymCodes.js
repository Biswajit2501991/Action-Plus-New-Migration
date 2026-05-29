import { Router } from 'express';
import { requireOwner } from '../middleware/requireOwner.js';
import { createGymCode, deleteGymCode, listGymCodes } from '../services/gymCodesService.js';
import {
  resolveBrandingForAuth,
  updateBranchBranding,
  uploadBranchBrandingLogo,
} from '../tenant/branding/BranchScopedBrandingService.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const codes = await listGymCodes();
    res.json(codes);
  } catch (err) {
    res.status(500).json({ error: 'gym-codes-read-failed', message: err.message });
  }
});

router.post('/', requireOwner, async (req, res) => {
  try {
    const created = await createGymCode({
      code: req.body?.code,
      name: req.body?.name || req.body?.branchName,
    });
    res.status(201).json(created);
  } catch (err) {
    const msg = err.message || '';
    // eslint-disable-next-line no-console
    console.error('[gym-codes] create failed:', msg);
    if (msg === 'code-required' || msg === 'name-required') {
      return res.status(400).json({ error: msg });
    }
    if (msg === 'code-exists') {
      return res.status(409).json({ error: msg });
    }
    res.status(500).json({ error: 'gym-codes-create-failed', message: msg });
  }
});

router.get('/:id/branding', async (req, res) => {
  try {
    const branding = await resolveBrandingForAuth(req.auth, req.params.id);
    res.json({ ok: true, branding });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'branding-read-failed' });
  }
});

router.patch('/:id/branding', requireOwner, async (req, res) => {
  try {
    const branding = await updateBranchBranding(req.auth, req.params.id, {
      displayName: req.body?.displayName ?? req.body?.display_name,
      clearLogo: Boolean(req.body?.clearLogo),
    });
    res.json({ ok: true, branding });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'branding-update-failed' });
  }
});

router.post('/:id/branding/logo', requireOwner, async (req, res) => {
  try {
    const raw = req.body?.logo || req.body?.dataUrl || req.body?.image;
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ error: 'logo-data-required' });
    }
    const match = raw.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
    const mime = match ? match[1].toLowerCase() : 'image/png';
    const b64 = match ? match[2] : raw;
    const buffer = Buffer.from(b64, 'base64');
    const branding = await uploadBranchBrandingLogo(req.auth, req.params.id, { buffer, mime });
    res.json({ ok: true, branding });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'branding-logo-upload-failed' });
  }
});

router.delete('/:id', requireOwner, async (req, res) => {
  try {
    await deleteGymCode(req.params.id);
    res.status(204).end();
  } catch (err) {
    const msg = err.message || '';
    if (msg === 'code-in-use-staff' || msg === 'code-in-use-members') {
      return res.status(409).json({ error: msg });
    }
    res.status(500).json({ error: 'gym-codes-delete-failed', message: msg });
  }
});

export default router;
