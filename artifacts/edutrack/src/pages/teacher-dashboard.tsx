import { useEffect, useState } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Calendar, Clock, Users, BookOpen, Video,
  AlertTriangle, CheckCircle2, XCircle, RefreshCw, LogOut, Clock3,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const _apiBase = ((import.meta.env.VITE_API_BASE_URL as string) || BASE).replace(/\/$/, "");
function apiUrl(path: string) { return `${_apiBase}/api${path}`; }

type Student = {
  userId: string;
  name: string;
  email: string;
  enrollmentRow: number;
  enrollmentId: string;
  attendanceToday: string | null;
};

type ClassGroup = {
  classId: string;
  name: string;
  type: string;
  days: string;
  time: string;
  room: string;
  zoomLink: string;
  isToday: boolean;
  studentCount: number;
  students: Student[];
};

type DashboardData = {
  tutor: Record<string, string> | null;
  classes: ClassGroup[];
  todayClasses: ClassGroup[];
  todayCount: number;
  totalClasses: number;
  activeEnrollmentCount: number;
  uniqueStudentCount: number;
};

const ATTENDANCE_OPTIONS = [
  { value: "Present", icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: "bg-green-100 text-green-700 border-green-200 hover:bg-green-200" },
  { value: "Absent",  icon: <XCircle      className="h-3.5 w-3.5" />, color: "bg-red-100 text-red-700 border-red-200 hover:bg-red-200" },
];

function AttendanceToggle({
  student, classId, sessionDate, markedBy, sheetId,
  onMarked,
}: {
  student: Student;
  classId: string;
  sessionDate: string;
  markedBy: string;
  sheetId: string;
  onMarked: (userId: string, status: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState<string | null>(student.attendanceToday);

  async function mark(status: string) {
    setSaving(true);
    try {
      await fetch(apiUrl("/attendance/mark"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, sessionDate, userId: student.userId, status, markedBy, sheetId }),
      });
      setCurrent(status);
      onMarked(student.userId, status);
    } catch {}
    setSaving(false);
  }

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg border bg-card">
      <div>
        <p className="text-sm font-medium">{student.name}</p>
        {student.email && <p className="text-xs text-muted-foreground">{student.email}</p>}
      </div>
      <div className="flex gap-1.5">
        {ATTENDANCE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            disabled={saving}
            onClick={() => mark(opt.value)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              current === opt.value ? opt.color + " ring-1 ring-offset-1 ring-current" : "border-border bg-background hover:bg-muted text-muted-foreground"
            }`}
          >
            {opt.icon}
            {opt.value}
          </button>
        ))}
      </div>
    </div>
  );
}

function ClassCard({
  group, sheetId, markedBy, todayISO,
}: {
  group: ClassGroup;
  sheetId: string;
  markedBy: string;
  todayISO: string;
}) {
  const [expanded, setExpanded] = useState(group.isToday);
  const [localStudents, setLocalStudents] = useState<Student[]>(group.students);
  const [showAttendance, setShowAttendance] = useState(false);

  function handleMarked(userId: string, status: string) {
    setLocalStudents(prev => prev.map(s => s.userId === userId ? { ...s, attendanceToday: status } : s));
  }

  const markedCount = localStudents.filter(s => s.attendanceToday).length;

  return (
    <Card
      className={group.isToday ? "border-primary/30 bg-primary/[0.02] cursor-pointer" : ""}
      onClick={() => group.isToday && setExpanded(v => !v)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{group.name}</CardTitle>
              {group.isToday && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">Today</span>
              )}
              {group.type && (
                <Badge variant="secondary" className="text-xs">{group.type}</Badge>
              )}
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
              {group.days && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {group.days}
                </span>
              )}
              {group.time && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {group.time}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {group.studentCount} student{group.studentCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {group.zoomLink && (
              <a
                href={group.zoomLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 transition-colors"
              >
                <Video className="h-3.5 w-3.5" />
                Join Zoom
              </a>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(v => !v);
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? "▲ Hide" : "▼ Students"}
            </button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-3">
          {localStudents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No enrolled students.</p>
          ) : (
            <>
              {group.isToday && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Attendance for today · {markedCount}/{localStudents.length} marked
                  </p>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const opening = !showAttendance;
                      setShowAttendance(opening);
                      if (opening) {
                        // Auto-mark all unmarked students as Present (default)
                        const unmarked = localStudents.filter(s => !s.attendanceToday);
                        if (unmarked.length > 0) {
                          await Promise.all(unmarked.map(s =>
                            fetch(apiUrl("/attendance/mark"), {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ classId: group.classId, sessionDate: todayISO, userId: s.userId, status: "Present", markedBy, sheetId }),
                            })
                          ));
                          setLocalStudents(prev => prev.map(s =>
                            s.attendanceToday ? s : { ...s, attendanceToday: "Present" }
                          ));
                        }
                      }
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    {showAttendance ? "Hide attendance" : "Mark attendance"}
                  </button>
                </div>
              )}
              {showAttendance && group.isToday ? (
                <div className="space-y-1.5">
                  {localStudents.map(s => (
                    <AttendanceToggle
                      key={s.userId}
                      student={s}
                      classId={group.classId}
                      sessionDate={todayISO}
                      markedBy={markedBy}
                      sheetId={sheetId}
                      onMarked={handleMarked}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {localStudents.map(s => (
                    <span key={s.userId} className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground">
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function TeacherDashboard() {
  const [, setLocation] = useLocation();
  const sheetId = localStorage.getItem("edutrack_sheet_id") || "";
  const email = localStorage.getItem("edutrack_user_email") || "";
  const role = localStorage.getItem("edutrack_user_role") || "";
  const name = localStorage.getItem("edutrack_user_name") || email;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const todayISO = new Date().toISOString().slice(0, 10);
  const todayLabel = new Date().toLocaleDateString("en-AU", { weekday: "long", month: "long", day: "numeric" });

  function signOut() {
    ["edutrack_user_role", "edutrack_user_email", "edutrack_user_name", "edutrack_user_id", "edutrack_sheet_id"]
      .forEach(k => localStorage.removeItem(k));
    setLocation("/");
  }

  async function load() {
    if (!sheetId || !email) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(apiUrl(`/tutors/me?email=${encodeURIComponent(email)}&sheetId=${encodeURIComponent(sheetId)}`));
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to load");
      setData(d);
    } catch (err: any) {
      setError(err.message || "Unable to load tutor dashboard.");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Redirect if not a tutor
  if (role && role !== "tutor" && role !== "teacher" && role !== "developer") {
    setLocation("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-border shadow-sm">
        <div className="max-w-5xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-primary flex items-center justify-center text-white font-bold text-sm">E</div>
            <span className="font-semibold text-foreground">EduTrack</span>
            <span className="text-muted-foreground/60">·</span>
            <span className="text-sm text-muted-foreground">Tutor</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{name}</span>
            <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 md:px-8 py-6 space-y-6">
        {/* Page heading */}
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Welcome, {name.split(" ")[0]}</h1>
          <p className="text-muted-foreground">{todayLabel}</p>
        </div>

        {/* Warnings */}
        {!sheetId && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">No Google Sheet linked. Please contact the principal or admin.</p>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {error}
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Classes Today</CardTitle>
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data?.todayCount ?? 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Classes</CardTitle>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data?.totalClasses ?? 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Students</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data?.uniqueStudentCount ?? 0}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Enrolments</CardTitle>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data?.activeEnrollmentCount ?? 0}</div>
                </CardContent>
              </Card>
            </div>

            {/* Class list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Your Classes</h2>
                <Button variant="ghost" size="sm" onClick={load} className="gap-1.5">
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>

              {(data?.classes ?? []).length === 0 ? (
                <div className="p-8 rounded-xl border border-dashed text-center text-muted-foreground">
                  <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No classes assigned yet. The principal will assign you to classes once enrolled students are matched.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(data?.classes ?? []).map(group => (
                    <ClassCard
                      key={group.classId}
                      group={group}
                      sheetId={sheetId}
                      markedBy={email}
                      todayISO={todayISO}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
