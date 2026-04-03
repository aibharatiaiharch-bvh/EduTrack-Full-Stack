import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, billingTable, studentsTable, classesTable } from "@workspace/db";
import {
  ListBillingRecordsResponse,
  CreateBillingRecordBody,
  UpdateBillingRecordParams,
  UpdateBillingRecordBody,
  UpdateBillingRecordResponse,
  DeleteBillingRecordParams,
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

async function enrichBilling(b: typeof billingTable.$inferSelect) {
  const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, b.studentId));
  let className: string | null = null;
  if (b.classId) {
    const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, b.classId));
    className = cls?.name ?? null;
  }
  return {
    ...b,
    amount: parseFloat(b.amount),
    studentName: student?.name ?? "Unknown",
    className,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
  };
}

router.get("/billing", requireAuth, async (req, res): Promise<void> => {
  const records = await db.select().from(billingTable).orderBy(billingTable.createdAt);
  const enriched = await Promise.all(records.map(enrichBilling));
  res.json(ListBillingRecordsResponse.parse(enriched));
});

router.post("/billing", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateBillingRecordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [record] = await db.insert(billingTable).values({
    ...parsed.data,
    amount: String(parsed.data.amount),
  }).returning();
  res.status(201).json(await enrichBilling(record));
});

router.patch("/billing/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateBillingRecordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBillingRecordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: any = { ...parsed.data };
  if (updateData.amount !== undefined) updateData.amount = String(updateData.amount);
  const [record] = await db.update(billingTable).set(updateData).where(eq(billingTable.id, params.data.id)).returning();
  if (!record) {
    res.status(404).json({ error: "Billing record not found" });
    return;
  }
  res.json(UpdateBillingRecordResponse.parse(await enrichBilling(record)));
});

router.delete("/billing/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteBillingRecordParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [record] = await db.delete(billingTable).where(eq(billingTable.id, params.data.id)).returning();
  if (!record) {
    res.status(404).json({ error: "Billing record not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
