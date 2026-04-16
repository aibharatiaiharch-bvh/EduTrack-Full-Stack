import cron from 'node-cron';
import { sendDailyBackup } from './backup.js';
import { isEmailConfigured } from './email.js';
import { logger } from './logger.js';

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
    logger.info('Running daily backup...');
    try {
      const result = await sendDailyBackup(sheetId);
      logger.info({ recipient: result.recipient, tabs: result.tabsSent.length }, 'Daily backup sent');
    } catch (err: any) {
      logger.error({ err: err.message }, 'Daily backup failed');
    }
  });

  logger.info({ schedule, recipient: process.env.BACKUP_RECIPIENT || process.env.PRINCIPAL_EMAIL }, 'Daily backup scheduled');
}
