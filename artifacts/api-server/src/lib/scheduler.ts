import cron, { type ScheduledTask } from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import { sendDailyBackup } from './backup.js';
import { isEmailConfigured } from './email.js';
import { logger } from './logger.js';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'backup-schedule.json');

type SchedulerState = { enabled: boolean; cron: string };

let state: SchedulerState = loadState();
let task: ScheduledTask | null = null;

function loadState(): SchedulerState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      return {
        enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
        cron: typeof raw.cron === 'string' && cron.validate(raw.cron) ? raw.cron : (process.env.BACKUP_CRON || '0 7 * * *'),
      };
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Could not read scheduler state — using defaults');
  }
  return { enabled: true, cron: process.env.BACKUP_CRON || '0 7 * * *' };
}

function persistState(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Could not persist scheduler state');
  }
}

export function isBackupEnabled(): boolean { return state.enabled; }
export function setBackupEnabled(val: boolean): void {
  state.enabled = val;
  persistState();
}
export function getBackupSchedule(): string { return state.cron; }
export function setBackupSchedule(expr: string): { ok: true } | { ok: false; error: string } {
  if (!cron.validate(expr)) return { ok: false, error: 'Invalid cron expression' };
  state.cron = expr;
  persistState();
  rearm();
  return { ok: true };
}

export function describeSchedule(expr: string = state.cron): string {
  // Minimal human-readable mapping for the presets we expose; falls back to raw.
  const presets: Record<string, string> = {
    '0 7 * * *':   'Daily at 7:00 AM',
    '0 7 * * 1-5': 'Weekdays at 7:00 AM',
    '0 7 * * 1':   'Weekly on Monday at 7:00 AM',
    '0 7 * * 0':   'Weekly on Sunday at 7:00 AM',
    '0 7 1 * *':   'Monthly on the 1st at 7:00 AM',
  };
  return presets[expr] || `Custom: ${expr}`;
}

function rearm(): void {
  if (task) {
    try { task.stop(); } catch { /* noop */ }
    task = null;
  }
  const sheetId = process.env.DEFAULT_SHEET_ID || '';
  if (!isEmailConfigured() || !sheetId) return;
  if (!cron.validate(state.cron)) {
    logger.warn({ schedule: state.cron }, 'Invalid cron — scheduler not armed');
    return;
  }
  task = cron.schedule(state.cron, async () => {
    if (!state.enabled) {
      logger.info('Daily backup skipped — disabled via developer tools');
      return;
    }
    logger.info('Running scheduled backup...');
    try {
      const result = await sendDailyBackup(sheetId);
      logger.info({ recipient: result.recipient, tabs: result.tabsSent.length }, 'Backup sent');
    } catch (err: any) {
      logger.error({ err: err.message }, 'Backup failed');
    }
  });
  logger.info({ schedule: state.cron, human: describeSchedule() }, 'Backup scheduler armed');
}

export function startScheduler(): void {
  if (!isEmailConfigured()) {
    logger.info('Backup scheduler: email not configured — skipping');
    return;
  }
  const sheetId = process.env.DEFAULT_SHEET_ID || '';
  if (!sheetId) {
    logger.info('Backup scheduler: no DEFAULT_SHEET_ID — skipping');
    return;
  }
  rearm();

  const recipients = [
    process.env.DEVELOPER_EMAIL,
    process.env.PRINCIPAL_EMAIL,
    process.env.BACKUP_RECIPIENT,
  ].filter((e): e is string => !!e && e.includes('@'));
  logger.info({ recipients: [...new Set(recipients)] }, 'Backup recipients');
}
