import { Router } from 'express';
import { getAllSettings, setSetting } from '../lib/settings.js';

const router = Router();

router.get('/settings', (_req, res): void => {
  res.json(getAllSettings());
});

router.patch('/settings', (req, res): void => {
  const allowed = ['PRINCIPAL_NAME'];
  const updated: Record<string, string> = {};
  for (const key of allowed) {
    if (typeof req.body[key] === 'string') {
      setSetting(key, req.body[key].trim());
      updated[key] = req.body[key].trim();
    }
  }
  res.json({ ok: true, updated, current: getAllSettings() });
});

export default router;
