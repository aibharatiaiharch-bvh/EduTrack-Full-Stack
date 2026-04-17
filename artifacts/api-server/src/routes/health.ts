import { Router, type IRouter } from "express";
import { google } from "googleapis";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/healthz/auth", (_req, res) => {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !privateKey) {
    res.json({ ok: false, reason: "missing env vars", hasEmail: !!email, hasKey: !!privateKey });
    return;
  }

  const rawLen = privateKey.length;

  privateKey = privateKey
    .replace(/^["']|["']$/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  const starts = privateKey.substring(0, 27);
  const ends = privateKey.substring(privateKey.length - 25);
  const lineCount = privateKey.split('\n').length;

  try {
    new google.auth.JWT({
      email,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    res.json({ ok: true, rawLen, starts, ends, lineCount });
  } catch (err: any) {
    res.json({ ok: false, error: err.message, rawLen, starts, ends, lineCount });
  }
});

export default router;
