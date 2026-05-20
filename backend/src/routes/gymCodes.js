import { Router } from 'express';
import { requireOwner } from '../middleware/requireOwner.js';
import { createGymCode, deleteGymCode, listGymCodes } from '../services/gymCodesService.js';

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
