import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, assessmentsTable, studentsTable, classesTable } from "@workspace/db";
import {
  ListAssessmentsResponse,
  CreateAssessmentBody,
  UpdateAssessmentParams,
  UpdateAssessmentBody,
  UpdateAssessmentResponse,
  DeleteAssessmentParams,
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

async function enrichAssessment(a: typeof assessmentsTable.$inferSelect) {
  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, a.studentId));
  const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, a.classId));
  const score = parseFloat(a.score);
  const maxScore = parseFloat(a.maxScore);
  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  return {
    ...a,
    score,
    maxScore,
    percentage,
    studentName: student?.name ?? "Unknown",
    className: cls?.name ?? "Unknown",
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

router.get("/assessments", requireAuth, async (req, res): Promise<void> => {
  const assessments = await db.select().from(assessmentsTable).orderBy(assessmentsTable.date);
  const enriched = await Promise.all(assessments.map(enrichAssessment));
  res.json(ListAssessmentsResponse.parse(enriched));
});

router.post("/assessments", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateAssessmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [assessment] = await db.insert(assessmentsTable).values({
    ...parsed.data,
    score: String(parsed.data.score),
    maxScore: String(parsed.data.maxScore),
  }).returning();
  res.status(201).json(await enrichAssessment(assessment));
});

router.patch("/assessments/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateAssessmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateAssessmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: any = { ...parsed.data };
  if (updateData.score !== undefined) updateData.score = String(updateData.score);
  if (updateData.maxScore !== undefined) updateData.maxScore = String(updateData.maxScore);
  const [assessment] = await db.update(assessmentsTable).set(updateData).where(eq(assessmentsTable.id, params.data.id)).returning();
  if (!assessment) {
    res.status(404).json({ error: "Assessment not found" });
    return;
  }
  res.json(UpdateAssessmentResponse.parse(await enrichAssessment(assessment)));
});

router.delete("/assessments/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteAssessmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [assessment] = await db.delete(assessmentsTable).where(eq(assessmentsTable.id, params.data.id)).returning();
  if (!assessment) {
    res.status(404).json({ error: "Assessment not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
