import { Router, type IRouter } from 'express';

const router: IRouter = Router();

// GET /api/admin/contact
// Returns developer contact info from environment variables only.
// No client sheet access — the developer is not entitled to read client data.
router.get('/admin/contact', (_req, res): void => {
  const email = process.env.DEVELOPER_EMAIL || '';
  const name  = process.env.DEVELOPER_NAME  || 'App Developer';
  res.json({ email, name });
});

// GET /api/admin/features
// Feature flags are managed entirely in the browser via localStorage.
// This endpoint exists only as a no-op compat shim; returns hardcoded defaults.
router.get('/admin/features', (_req, res): void => {
  res.json({ assessments: true, billing: true, schedule: true });
});

// PUT /api/admin/features
// No-op — the client saves feature flags to localStorage directly.
router.put('/admin/features', (_req, res): void => {
  res.json({ ok: true });
});

export default router;
