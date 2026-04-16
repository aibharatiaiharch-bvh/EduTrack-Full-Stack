import fs from "fs";
import { sendEmail, isEmailConfigured } from "./email.js";

const ALERT_THRESHOLD = 3;
const RATE_LIMIT_MS = 60 * 60 * 1000; // 1 hour
const ALERT_STATE_FILE = process.env.GITHUB_SYNC_ALERT_STATE_FILE || "/tmp/github-sync-alert-state.json";

interface AlertState {
  lastSentAt: string | null;
  lastSentForFailureCount: number;
}

function readAlertState(): AlertState {
  try {
    if (fs.existsSync(ALERT_STATE_FILE)) {
      const raw = fs.readFileSync(ALERT_STATE_FILE, "utf8");
      return JSON.parse(raw);
    }
  } catch {
  }
  return { lastSentAt: null, lastSentForFailureCount: 0 };
}

function writeAlertState(state: AlertState): void {
  try {
    fs.writeFileSync(ALERT_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch {
  }
}

export interface SyncStatusPayload {
  status: string;
  message: string;
  failureCount: number;
  lastAttemptAt: string | null;
  lastFailedAt: string | null;
  branch?: string;
}

export async function maybeSendSyncFailureAlert(syncStatus: SyncStatusPayload): Promise<void> {
  if (syncStatus.status !== "failed") return;
  if (syncStatus.failureCount < ALERT_THRESHOLD) return;

  const alertEmail = process.env.GITHUB_SYNC_ALERT_EMAIL;
  if (!alertEmail) return;
  if (!isEmailConfigured()) return;

  const now = Date.now();
  const state = readAlertState();

  if (state.lastSentAt) {
    const elapsed = now - new Date(state.lastSentAt).getTime();
    if (elapsed < RATE_LIMIT_MS) return;
  }

  const branch = syncStatus.branch || "unknown";
  const failureCount = syncStatus.failureCount;
  const errorMessage = syncStatus.message || "No details available";
  const timestamp = syncStatus.lastFailedAt || syncStatus.lastAttemptAt || new Date().toISOString();

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #dc2626; margin-bottom: 8px;">&#x26A0; GitHub Sync Failure Alert</h2>
      <p style="color: #374151; margin-bottom: 24px;">
        The GitHub auto-push script has failed <strong>${failureCount} consecutive times</strong>.
        Manual intervention may be required.
      </p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 10px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600; width: 40%;">Consecutive Failures</td>
          <td style="padding: 10px 12px; border: 1px solid #e5e7eb; color: #dc2626; font-weight: 700;">${failureCount}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600;">Branch</td>
          <td style="padding: 10px 12px; border: 1px solid #e5e7eb; font-family: monospace;">${branch}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600;">Last Failed At</td>
          <td style="padding: 10px 12px; border: 1px solid #e5e7eb;">${timestamp}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; background: #f9fafb; border: 1px solid #e5e7eb; font-weight: 600;">Error</td>
          <td style="padding: 10px 12px; border: 1px solid #e5e7eb; color: #6b7280;">${errorMessage}</td>
        </tr>
      </table>
      <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">
        This alert is rate-limited to once per hour. Check the EduTrack Admin Portal for live sync status.
      </p>
    </div>
  `;

  await sendEmail({
    to: alertEmail,
    subject: `[EduTrack] GitHub Sync Failed ${failureCount}x — Action Required`,
    html,
  });

  writeAlertState({
    lastSentAt: new Date(now).toISOString(),
    lastSentForFailureCount: failureCount,
  });
}
