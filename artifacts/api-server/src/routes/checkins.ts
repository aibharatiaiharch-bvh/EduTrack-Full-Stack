import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, checkinsTable, studentsTable, classesTable } from "@workspace/db";
import {
  ListCheckinsResponse,
  ListCheckinsQueryParams,
  CreateCheckinBody,
  UpdateCheckinParams,
  UpdateCheckinBody,
  UpdateCheckinResponse,
  DeleteCheckinParams,
} from "@workspace/api-zod";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

async function enrichCheckin(c: typeof checkinsTable.$inferSelect) {
  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, c.studentId));
  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, c.classId));
  return {
    ...c,
    studentName: student?.name ?? "Unknown",
    className: cls?.name ?? "Unknown",
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

router.get("/checkins", requireAuth, async (req, res): Promise<void> => {
  const query = ListCheckinsQueryParams.safeParse(req.query);
  let checkins;
  if (query.success && query.data.date) {
    checkins = await db.select().from(checkinsTable).where(eq(checkinsTable.date, query.data.date)).orderBy(checkinsTable.scheduledTime);
  } else {
    checkins = await db.select().from(checkinsTable).orderBy(checkinsTable.date, checkinsTable.scheduledTime);
  }
  const enriched = await Promise.all(checkins.map(enrichCheckin));
  res.json(ListCheckinsResponse.parse(enriched));
});

router.post("/checkins", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCheckinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [checkin] = await db.insert(checkinsTable).values(parsed.data).returning();
  res.status(201).json(await enrichCheckin(checkin));
});

router.patch("/checkins/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateCheckinParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCheckinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [checkin] = await db.update(checkinsTable).set(parsed.data).where(eq(checkinsTable.id, params.data.id)).returning();
  if (!checkin) {
    res.status(404).json({ error: "Check-in not found" });
    return;
  }
  res.json(UpdateCheckinResponse.parse(await enrichCheckin(checkin)));
});

router.delete("/checkins/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteCheckinParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [checkin] = await db.delete(checkinsTable).where(eq(checkinsTable.id, params.data.id)).returning();
  if (!checkin) {
    res.status(404).json({ error: "Check-in not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
