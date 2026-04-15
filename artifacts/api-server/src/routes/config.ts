import { Router } from "express";

const router = Router();

router.get("/config", (_req, res) => {
  const sheetId = process.env.DEFAULT_SHEET_ID || null;
  res.json({ sheetId });
});

export default router;
