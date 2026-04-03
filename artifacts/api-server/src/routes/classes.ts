import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, classesTable, teachersTable, studentsTable, checkinsTable } from "@workspace/db";
import {
  ListClassesResponse,
  CreateClassBody,
  GetClassParams,
  GetClassResponse,
  UpdateClassParams,
  UpdateClassBody,
  UpdateClassResponse,
  DeleteClassParams,
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

async function enrichClass(cls: typeof classesTable.$inferSelect) {
  let teacherName: string | null = null;
  if (cls.teacherId) {
    const [teacher] = await db.select().from(teachersTable).where(eq(teachersTable.id, cls.teacherId));
    teacherName = teacher?.name ?? null;
  }
  const enrolledCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(checkinsTable)
    .where(eq(checkinsTable.classId, cls.id));
  return {
    ...cls,
    teacherName,
    enrolledCount: 0, // simplified - use checkins for daily
    createdAt: cls.createdAt.toISOString(),
    updatedAt: cls.updatedAt.toISOString(),
  };
}

router.get("/classes", requireAuth, async (req, res): Promise<void> => {
  const classes = await db.select().from(classesTable).orderBy(classesTable.createdAt);
  const enriched = await Promise.all(classes.map(enrichClass));
  res.json(ListClassesResponse.parse(enriched));
});

router.post("/classes", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [cls] = await db.insert(classesTable).values(parsed.data).returning();
  res.status(201).json(GetClassResponse.parse(await enrichClass(cls)));
});

router.get("/classes/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, params.data.id));
  if (!cls) {
    res.status(404).json({ error: "Class not found" });
    return;
  }
  res.json(GetClassResponse.parse(await enrichClass(cls)));
});

router.patch("/classes/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [cls] = await db.update(classesTable).set(parsed.data).where(eq(classesTable.id, params.data.id)).returning();
  if (!cls) {
    res.status(404).json({ error: "Class not found" });
    return;
  }
  res.json(UpdateClassResponse.parse(await enrichClass(cls)));
});

router.delete("/classes/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteClassParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [cls] = await db.delete(classesTable).where(eq(classesTable.id, params.data.id)).returning();
  if (!cls) {
    res.status(404).json({ error: "Class not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
