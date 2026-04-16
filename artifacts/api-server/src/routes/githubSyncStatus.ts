import { Router } from "express";
import fs from "fs";
import { maybeSendSyncFailureAlert } from "../lib/githubSyncAlert.js";

const router = Router();

const STATUS_FILE = process.env.GITHUB_PUSH_STATUS_FILE || "/tmp/github-push-status.json";
const SYNC_STATUS_FILE = process.env.GITHUB_SYNC_STATUS_FILE || "/home/runner/workspace/.github-sync-status.json";

router.get("/github-sync-status", (_req, res) => {
  try {
    if (!fs.existsSync(STATUS_FILE)) {
      return res.json({ status: "unknown", message: "No sync has run yet", failureCount: 0, lastAttemptAt: null, lastSucceededAt: null, lastFailedAt: null });
    }
    const raw = fs.readFileSync(STATUS_FILE, "utf8");
    const data = JSON.parse(raw);

    // Attach branch from the sync status file if available
    let branch: string | undefined;
    try {
      if (fs.existsSync(SYNC_STATUS_FILE)) {
        const syncRaw = fs.readFileSync(SYNC_STATUS_FILE, "utf8");
        const syncData = JSON.parse(syncRaw);
        branch = syncData.branch;
      }
    } catch {
    }

    // Fire alert check asynchronously — do not block the response
    maybeSendSyncFailureAlert({ ...data, branch }).catch(() => {});

    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: "Failed to read sync status" });
  }
});

export default router;
