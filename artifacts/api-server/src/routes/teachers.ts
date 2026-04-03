import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, teachersTable } from "@workspace/db";
import {
  ListTeachersResponse,
  CreateTeacherBody,
  GetTeacherParams,
  GetTeacherResponse,
  UpdateTeacherParams,
  UpdateTeacherBody,
  UpdateTeacherResponse,
  DeleteTeacherParams,
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

router.get("/teachers", requireAuth, async (req, res): Promise<void> => {
  const teachers = await db.select().from(teachersTable).orderBy(teachersTable.createdAt);
  res.json(ListTeachersResponse.parse(teachers.map(t => ({ ...t, createdAt: t.createdAt.toISOString(), updatedAt: t.updatedAt.toISOString() }))));
});

router.post("/teachers", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateTeacherBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [teacher] = await db.insert(teachersTable).values(parsed.data).returning();
  res.status(201).json(GetTeacherResponse.parse({ ...teacher, createdAt: teacher.createdAt.toISOString(), updatedAt: teacher.updatedAt.toISOString() }));
});

router.get("/teachers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetTeacherParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [teacher] = await db.select().from(teachersTable).where(eq(teachersTable.id, params.data.id));
  if (!teacher) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  res.json(GetTeacherResponse.parse({ ...teacher, createdAt: teacher.createdAt.toISOString(), updatedAt: teacher.updatedAt.toISOString() }));
});

router.patch("/teachers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateTeacherParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTeacherBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [teacher] = await db.update(teachersTable).set(parsed.data).where(eq(teachersTable.id, params.data.id)).returning();
  if (!teacher) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  res.json(UpdateTeacherResponse.parse({ ...teacher, createdAt: teacher.createdAt.toISOString(), updatedAt: teacher.updatedAt.toISOString() }));
});

router.delete("/teachers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteTeacherParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [teacher] = await db.delete(teachersTable).where(eq(teachersTable.id, params.data.id)).returning();
  if (!teacher) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
