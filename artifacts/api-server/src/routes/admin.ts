import { Router, type IRouter } from 'express';

const router: IRouter = Router();

// GET /api/admin/contact — returns developer contact info (read-only, sourced from env)
router.get('/admin/contact', (_req, res): void => {
  const email = process.env.DEVELOPER_EMAIL || '';
  const name = process.env.DEVELOPER_NAME || 'App Developer';
  if (!email) {
    res.status(404).json({ error: 'Developer contact not configured' });
    return;
  }
  res.json({ email, name });
});

export default router;
