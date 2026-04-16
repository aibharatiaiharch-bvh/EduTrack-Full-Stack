import { Router, type IRouter } from 'express';
import fs from 'fs';
import path from 'path';

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
  res.json({ schedule: true });
});

// PUT /api/admin/features
// No-op — the client saves feature flags to localStorage directly.
router.put('/admin/features', (_req, res): void => {
  res.json({ ok: true });
});

// GET /api/admin/github-sync
// Returns the timestamp and branch of the last successful GitHub push.
// The sync script writes a JSON file on each successful push.
router.get('/admin/github-sync', (_req, res): void => {
  const statusFile = process.env.GITHUB_SYNC_STATUS_FILE || path.join('/home/runner/workspace', '.github-sync-status.json');
  try {
    const raw = fs.readFileSync(statusFile, 'utf8');
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== 'object') {
      res.json({ lastSyncedAt: null, branch: null });
      return;
    }
    const { lastSyncedAt, branch } = data as Record<string, unknown>;
    const syncedAt = typeof lastSyncedAt === 'string' && !isNaN(Date.parse(lastSyncedAt)) ? lastSyncedAt : null;
    const branchName = typeof branch === 'string' && branch.length > 0 ? branch : null;
    res.json({ lastSyncedAt: syncedAt, branch: branchName });
  } catch {
    res.json({ lastSyncedAt: null, branch: null });
  }
});

export default router;
