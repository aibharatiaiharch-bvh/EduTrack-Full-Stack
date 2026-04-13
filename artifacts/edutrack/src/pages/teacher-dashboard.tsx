import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, Users, BookOpen, Video, AlertTriangle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

type DashboardData = {
  tutor: Record<string, string> | null;
  todayEnrollments: Record<string, string>[];
  upcomingEnrollments: Record<string, string>[];
  todayCount: number;
  activeEnrollmentCount: number;
  uniqueStudentCount: number;
  activeStudentCount: number;
};

export default function TeacherDashboard() {
  const { user } = useUser();
  const sheetId = localStorage.getItem("edutrack_sheet_id") || "";
  const email = user?.primaryEmailAddress?.emailAddress || "";
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sheetId || !email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(apiUrl(`/tutors/me?email=${encodeURIComponent(email)}&sheetId=${encodeURIComponent(sheetId)}`))
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError("Unable to load teacher dashboard."); setLoading(false); });
  }, [email, sheetId]);

  const name = data?.tutor?.["Name"] || user?.fullName || email;
  const subjects = data?.tutor?.["Subjects"] || "";

  const studentList = useMemo(() => {
    const rows = data?.upcomingEnrollments ?? [];
    return Array.from(new Set(rows.map(r => r["Student Name"]).filter(Boolean))).sort();
  }, [data]);

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 max-w-5xl">
        <header className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Teacher Dashboard</h1>
          <p className="text-muted-foreground">Welcome, {name}{subjects ? ` · ${subjects}` : ""}</p>
        </header>

        {!sheetId && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">No Google Sheet linked. Please connect a sheet in Settings.</p>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm">{error}</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Today" value={data?.todayCount ?? 0} icon={<Calendar className="h-4 w-4" />} />
              <StatCard title="Enrolments" value={data?.activeEnrollmentCount ?? 0} icon={<BookOpen className="h-4 w-4" />} />
              <StatCard title="Students" value={data?.uniqueStudentCount ?? 0} icon={<Users className="h-4 w-4" />} />
              <StatCard title="Active Students" value={data?.activeStudentCount ?? 0} icon={<Users className="h-4 w-4" />} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Today’s Schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(data?.todayEnrollments ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No classes scheduled for today.</p>
                ) : (
                  data!.todayEnrollments.map((row, i) => (
                    <ScheduleRow key={i} row={row} />
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  Enrolled Students
                </CardTitle>
              </CardHeader>
              <CardContent>
                {studentList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No enrolled students found.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {studentList.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function StatCard({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function ScheduleRow({ row }: { row: Record<string, string> }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border p-4">
      <div className="space-y-1">
        <p className="font-medium">{row["Class Name"] || "—"}</p>
        <p className="text-sm text-muted-foreground">{row["Student Name"] || "Unknown student"}</p>
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {row["Class Date"] && <span>{row["Class Date"]}</span>}
        {row["Class Time"] && <span>· {row["Class Time"]}</span>}
        {row["Zoom Link"] && <a href={row["Zoom Link"]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><Video className="h-3 w-3" />Zoom</a>}
      </div>
    </div>
  );
}