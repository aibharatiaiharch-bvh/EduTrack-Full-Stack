import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Pre-auth routes — must be accessible without Clerk (CORS already applied above)
app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok" });
});
app.get("/api/config", (_req, res) => {
  const sheetId = process.env.DEFAULT_SHEET_ID || null;
  res.json({ sheetId });
});
// Clerk middleware — wrapped so a config failure doesn't crash all routes
try {
  app.use((req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(clerkMiddleware()(req, res, next)).catch(next);
  });
} catch (e) {
  logger.warn({ err: e }, "Clerk middleware failed to initialise — continuing without auth");
}

app.use("/api", router);

// Global error handler — logs the real error and returns JSON
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: err?.message || "Internal server error" });
});

export default app;
