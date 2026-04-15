import { useEffect, useState } from "react";
import { useUser } from "@clerk/react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, BookOpen, CalendarCheck, Clock, CheckSquare } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiUrl(path: string) {
  return `${BASE}/api${path}`;
}

interface TutorDashboardData {
  tutor: Record<string, string> | null;
  todayEnrollments: Record<string, string>[];
  todayCount: number;
  activeEnrollmentCount: number;
  uniqueStudentCount: number;
  activeStudentCount: number;
}

export default function Dashboard() {
  const { user } = useUser();
  const [data, setData] = useState<TutorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const sheetId = localStorage.getItem("edutrack_sheet_id") || "";
  const email = user?.primaryEmailAddress?.emailAddress || "";
  const storedName = localStorage.getItem("edutrack_user_name") || user?.fullName || "";

  useEffect(() => {
    if (!email || !sheetId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(apiUrl(`/tutors/me?email=${encodeURIComponent(email)}&sheetId=${encodeURIComponent(sheetId)}`))
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError("Unable to load dashboard data. Please refresh.");
        setLoading(false);
      });
  }, [email, sheetId]);

  const tutorName = data?.tutor?.["Name"] || storedName || email;
  const subjects = data?.tutor?.["Subjects"] || "";
  const tutorRole = data?.tutor?.["Role"] || "Tutor";
  const summaryLinks = [
    { href: "#today-classes", title: "Classes Today" },
    { href: "/classes", title: "Active Enrolments" },
    { href: "/classes", title: "Students" },
    { href: "/classes", title: "Total Active Students" },
  ];

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 md:space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              Welcome, {tutorName.split(" ")[0]}
            </h1>
            <p className="text-muted-foreground mt-1">
              {subjects ? `${tutorRole} · ${subjects}` : tutorRole}
            </p>
          </div>
          <Link href="/checkin">
            <Button className="gap-2">
              <CheckSquare className="w-4 h-4" />
              Start Check-in
            </Button>
          </Link>
        </header>

        {/* Summary cards */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm">{error}</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="hover:border-primary/50 transition-colors">
              <Link href={summaryLinks[0].href} className="block">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Classes Today</CardTitle>
                <CalendarCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.todayCount ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">scheduled for today</p>
              </CardContent>
              </Link>
            </Card>

            <Card className="hover:border-primary/50 transition-colors">
              <Link href={summaryLinks[1].href} className="block">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Enrolments</CardTitle>
                <BookOpen className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.activeEnrollmentCount ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">enrolled classes</p>
              </CardContent>
              </Link>
            </Card>

            <Card className="hover:border-primary/50 transition-colors">
              <Link href={summaryLinks[2].href} className="block">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Students</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.uniqueStudentCount ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">across all classes</p>
              </CardContent>
              </Link>
            </Card>

            <Card className="hover:border-primary/50 transition-colors">
              <Link href={summaryLinks[3].href} className="block">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Active Students</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.activeStudentCount ?? 0}</div>
                <p className="text-xs text-muted-foreground mt-1">in the system</p>
              </CardContent>
              </Link>
            </Card>
          </div>
        )}

        {/* Today's schedule */}
        <Card id="today-classes">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Today's Classes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
              </div>
            ) : !data || data.todayEnrollments.length === 0 ? (
              <div className="flex items-center justify-center h-32 border-2 border-dashed border-border rounded-lg text-muted-foreground text-sm">
                No classes scheduled for today.
              </div>
            ) : (
              <div className="space-y-2">
                {data.todayEnrollments.map((enr, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                    <div>
                      <p className="font-medium text-sm">{enr["Class Name"] || "—"}</p>
                      <p className="text-xs text-muted-foreground">{enr["Student Name"]}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {enr["Class Time"] && (
                        <span className="text-xs text-muted-foreground">{enr["Class Time"]}</span>
                      )}
                      <Badge variant="secondary" className="text-xs">{enr["Status"]}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <Link href="/checkin">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-primary" />
                  Class Check-in
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Record student attendance for today's classes.</p>
              </CardContent>
            </Link>
          </Card>

          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <Link href="/classes">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  View All Classes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">See all enrolled classes and upcoming sessions.</p>
              </CardContent>
            </Link>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
