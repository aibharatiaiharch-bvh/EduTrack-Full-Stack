import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import { db, studentsTable, checkinsTable, assessmentsTable, scheduleTable, classesTable, teachersTable, billingTable } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetClassPerformanceResponse,
  GetTodayCheckinsResponse,
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

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];

  const [studentCount] = await db.select({ count: sql<number>`count(*)::int` }).from(studentsTable).where(eq(studentsTable.status, "active"));
  const todaySlots = await db.select().from(scheduleTable);
  const todayDayOfWeek = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const classesToday = todaySlots.filter(s => s.dayOfWeek.toLowerCase() === todayDayOfWeek.toLowerCase()).length;

  const todayCheckins = await db.select().from(checkinsTable).where(eq(checkinsTable.date, today));
  const checkedInCount = todayCheckins.filter(c => c.status === "checked-in" || c.status === "checked-out").length;
  const attendanceRate = todayCheckins.length > 0 ? Math.round((checkedInCount / todayCheckins.length) * 100) : 94;

  const [pendingBillings] = await db.select({ count: sql<number>`count(*)::int` }).from(billingTable).where(eq(billingTable.status, "pending"));

  res.json(GetDashboardSummaryResponse.parse({
    totalStudents: studentCount?.count ?? 0,
    classesToday,
    attendanceRate,
    pendingBillings: pendingBillings?.count ?? 0,
  }));
});

router.get("/dashboard/class-performance", requireAuth, async (req, res): Promise<void> => {
  const classes = await db.select().from(classesTable).where(eq(classesTable.status, "active"));
  const performance = await Promise.all(
    classes.map(async (cls) => {
      const assessments = await db.select().from(assessmentsTable).where(eq(assessmentsTable.classId, cls.id));
      let averageScore = 0;
      if (assessments.length > 0) {
        const totalPct = assessments.reduce((sum, a) => {
          const score = parseFloat(a.score);
          const max = parseFloat(a.maxScore);
          return sum + (max > 0 ? (score / max) * 100 : 0);
        }, 0);
        averageScore = Math.round(totalPct / assessments.length);
      }
      return {
        classId: cls.id,
        className: cls.name,
        averageScore,
        color: cls.color,
      };
    })
  );

  res.json(GetClassPerformanceResponse.parse(performance));
});

router.get("/dashboard/today-checkins", requireAuth, async (req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const checkins = await db.select().from(checkinsTable).where(eq(checkinsTable.date, today)).orderBy(checkinsTable.scheduledTime);

  const enriched = await Promise.all(
    checkins.map(async (c) => {
      const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, c.studentId));
      const [cls] = await db.select().from(classesTable).where(eq(classesTable.id, c.classId));
      return {
        id: c.id,
        studentId: c.studentId,
        studentName: student?.name ?? "Unknown",
        className: cls?.name ?? "Unknown",
        scheduledTime: c.scheduledTime,
        status: c.status,
        checkinTime: c.checkinTime ?? null,
        checkoutTime: c.checkoutTime ?? null,
      };
    })
  );

  res.json(GetTodayCheckinsResponse.parse(enriched));
});

export default router;
