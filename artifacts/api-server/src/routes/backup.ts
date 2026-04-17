import { Router, type IRouter } from 'express';
import { sendDailyBackup } from '../lib/backup.js';
import { isEmailConfigured } from '../lib/email.js';
import { isBackupEnabled, setBackupEnabled } from '../lib/scheduler.js';

const router: IRouter = Router();

function getSheetId(req: any): string {
  return req.body?.sheetId || req.query.sheetId ||
    process.env.DEFAULT_SHEET_ID || '';
}

function getRecipients(): string[] {
  return [
    process.env.DEVELOPER_EMAIL,
    process.env.PRINCIPAL_EMAIL,
    process.env.BACKUP_RECIPIENT,
  ].filter((e): e is string => !!e && e.includes('@'));
}

// GET /api/backup/status
router.get('/backup/status', (_req, res): void => {
  const configured = isEmailConfigured();
  const recipients = [...new Set(getRecipients())];
  res.json({
    enabled: isBackupEnabled(),
    emailConfigured: configured,
    recipients,
    schedule: process.env.BACKUP_CRON || '0 7 * * *',
    scheduleHuman: 'Daily at 7:00 AM',
    sheetId: process.env.DEFAULT_SHEET_ID || null,
    missing: [
      !process.env.SMTP_HOST && 'SMTP_HOST',
      !process.env.SMTP_USER && 'SMTP_USER',
      !process.env.SMTP_PASS && 'SMTP_PASS',
    ].filter(Boolean),
  });
});

// POST /api/backup/toggle — enable or disable the scheduled backup
router.post('/backup/toggle', (req, res): void => {
  const { enabled } = req.body ?? {};
  const next = typeof enabled === 'boolean' ? enabled : !isBackupEnabled();
  setBackupEnabled(next);
  res.json({ ok: true, enabled: next });
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
