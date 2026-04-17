import cron from 'node-cron';
import { sendDailyBackup } from './backup.js';
import { isEmailConfigured } from './email.js';
import { logger } from './logger.js';

let backupEnabled = true;

export function isBackupEnabled(): boolean { return backupEnabled; }
export function setBackupEnabled(val: boolean): void { backupEnabled = val; }

export function startScheduler(): void {
  const schedule = process.env.BACKUP_CRON || '0 7 * * *';
  const sheetId  = process.env.DEFAULT_SHEET_ID || '';

  if (!isEmailConfigured()) {
    logger.info('Daily backup scheduler: email not configured — skipping (set SMTP_HOST, SMTP_USER, SMTP_PASS to enable)');
    return;
  }

  if (!sheetId) {
    logger.info('Daily backup scheduler: no DEFAULT_SHEET_ID — skipping');
    return;
  }

  if (!cron.validate(schedule)) {
    logger.warn({ schedule }, 'Daily backup scheduler: invalid BACKUP_CRON expression — skipping');
    return;
  }

  cron.schedule(schedule, async () => {
    if (!backupEnabled) {
      logger.info('Daily backup skipped — disabled via developer tools');
      return;
    }
    logger.info('Running daily backup...');
    try {
      const result = await sendDailyBackup(sheetId);
      logger.info({ recipient: result.recipient, tabs: result.tabsSent.length }, 'Daily backup sent');
    } catch (err: any) {
      logger.error({ err: err.message }, 'Daily backup failed');
    }
  });

  const recipients = [
    process.env.DEVELOPER_EMAIL,
    process.env.PRINCIPAL_EMAIL,
    process.env.BACKUP_RECIPIENT,
  ].filter((e): e is string => !!e && e.includes('@'));

  logger.info({ schedule, recipients: [...new Set(recipients)] }, 'Daily backup scheduled');
}
