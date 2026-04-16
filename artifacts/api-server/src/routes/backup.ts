import { Router, type IRouter } from 'express';
import { sendDailyBackup } from '../lib/backup.js';
import { isEmailConfigured } from '../lib/email.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.body?.sheetId || req.query.sheetId ||
    process.env.DEFAULT_SHEET_ID || '';
}

// GET /api/backup/status — check config without sending
router.get('/backup/status', (_req, res): void => {
  const configured = isEmailConfigured();
  res.json({
    emailConfigured: configured,
    recipient: process.env.BACKUP_RECIPIENT || process.env.PRINCIPAL_EMAIL || null,
    schedule: process.env.BACKUP_CRON || '0 7 * * *',
    sheetId: process.env.DEFAULT_SHEET_ID || null,
    missing: [
      !process.env.SMTP_HOST && 'SMTP_HOST',
      !process.env.SMTP_USER && 'SMTP_USER',
      !process.env.SMTP_PASS && 'SMTP_PASS',
    ].filter(Boolean),
  });
});

// POST /api/backup/send — manual trigger
router.post('/backup/send', async (req, res): Promise<void> => {
  const spreadsheetId = getSheetId(req);
  if (!spreadsheetId) {
    res.status(400).json({ error: 'No Sheet ID available. Set DEFAULT_SHEET_ID or pass sheetId in body.' });
    return;
  }
  if (!isEmailConfigured()) {
    res.status(400).json({
      error: 'Email not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables.',
    });
    return;
  }
  try {
    const result = await sendDailyBackup(spreadsheetId);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
