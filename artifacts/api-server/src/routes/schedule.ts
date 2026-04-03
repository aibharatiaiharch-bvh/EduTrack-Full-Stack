import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, scheduleTable, classesTable, teachersTable } from "@workspace/db";
import {
  ListScheduleSlotsResponse,
  CreateScheduleSlotBody,
  UpdateScheduleSlotParams,
  UpdateScheduleSlotBody,
  UpdateScheduleSlotResponse,
  DeleteScheduleSlotParams,
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

async function enrichSlot(s: typeof scheduleTable.$inferSelect) {
  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, s.classId));
  let teacherName: string | null = null;
  if (cls?.teacherId) {
    const [teacher] = await db.select().from(teachersTable).where(eq(teachersTable.id, cls.teacherId));
    teacherName = teacher?.name ?? null;
  }
  return {
    ...s,
    className: cls?.name ?? "Unknown",
    teacherName,
    color: cls?.color ?? "blue",
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

router.get("/schedule", requireAuth, async (req, res): Promise<void> => {
  const slots = await db.select().from(scheduleTable).orderBy(scheduleTable.dayOfWeek, scheduleTable.startTime);
  const enriched = await Promise.all(slots.map(enrichSlot));
  res.json(ListScheduleSlotsResponse.parse(enriched));
});

router.post("/schedule", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateScheduleSlotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [slot] = await db.insert(scheduleTable).values(parsed.data).returning();
  res.status(201).json(await enrichSlot(slot));
});

router.patch("/schedule/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateScheduleSlotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateScheduleSlotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [slot] = await db.update(scheduleTable).set(parsed.data).where(eq(scheduleTable.id, params.data.id)).returning();
  if (!slot) {
    res.status(404).json({ error: "Schedule slot not found" });
    return;
  }
  res.json(UpdateScheduleSlotResponse.parse(await enrichSlot(slot)));
});

router.delete("/schedule/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteScheduleSlotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [slot] = await db.delete(scheduleTable).where(eq(scheduleTable.id, params.data.id)).returning();
  if (!slot) {
    res.status(404).json({ error: "Schedule slot not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
