import { Router } from "express";
import fs from "fs";

const router = Router();

const STATUS_FILE = process.env.GITHUB_PUSH_STATUS_FILE || "/tmp/github-push-status.json";

router.get("/github-sync-status", (_req, res) => {
  try {
    if (!fs.existsSync(STATUS_FILE)) {
      return res.json({ status: "unknown", message: "No sync has run yet", failureCount: 0, lastAttemptAt: null, lastSucceededAt: null, lastFailedAt: null });
    }
    const raw = fs.readFileSync(STATUS_FILE, "utf8");
    const data = JSON.parse(raw);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: "Failed to read sync status" });
  }
});

export default router;
