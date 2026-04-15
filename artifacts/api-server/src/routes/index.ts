import { Router, type IRouter } from "express";
import healthRouter from "./health";
import checkinsRouter from "./checkins";
import sheetsRouter from "./sheets";
import enrollmentsRouter from "./enrollments";
import rolesRouter from "./roles";
import adminRouter from "./admin";
import principalsRouter from "./principals";
import usersRouter from "./users";
import tutorsRouter from "./tutors";
import subjectsRouter from "./subjects";
import announcementsRouter from "./announcements";
import scheduleCalendarRouter from "./scheduleCalendar";

const router: IRouter = Router();

router.use(healthRouter);
router.use(checkinsRouter);
router.use(sheetsRouter);
router.use(enrollmentsRouter);
router.use(rolesRouter);
router.use(adminRouter);
router.use(principalsRouter);
router.use(usersRouter);
router.use(tutorsRouter);
router.use(subjectsRouter);
router.use(announcementsRouter);
router.use(scheduleCalendarRouter);
router.use(classesRouter);

export default router;
