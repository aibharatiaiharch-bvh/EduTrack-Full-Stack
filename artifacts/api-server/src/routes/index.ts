import { Router, type IRouter } from "express";
import healthRouter from "./health";
import studentsRouter from "./students";
import teachersRouter from "./teachers";
import classesRouter from "./classes";
import checkinsRouter from "./checkins";
import assessmentsRouter from "./assessments";
import billingRouter from "./billing";
import scheduleRouter from "./schedule";
import dashboardRouter from "./dashboard";
import sheetsRouter from "./sheets";
import enrollmentsRouter from "./enrollments";
import rolesRouter from "./roles";
import adminRouter from "./admin";
import principalsRouter from "./principals";
import usersRouter from "./users";

const router: IRouter = Router();

router.use(healthRouter);
router.use(studentsRouter);
router.use(teachersRouter);
router.use(classesRouter);
router.use(checkinsRouter);
router.use(assessmentsRouter);
router.use(billingRouter);
router.use(scheduleRouter);
router.use(dashboardRouter);
router.use(sheetsRouter);
router.use(enrollmentsRouter);
router.use(rolesRouter);
router.use(adminRouter);
router.use(principalsRouter);
router.use(usersRouter);

export default router;
