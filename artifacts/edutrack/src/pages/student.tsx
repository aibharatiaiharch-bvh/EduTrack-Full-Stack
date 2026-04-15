import { useUser } from "@clerk/react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Calendar, Clock, BookOpen, User, Users,
  AlertTriangle, Video, CheckCircle2, ChevronRight,
} from "lucide-react";

const SHEET_KEY = "edutrack_sheet_id";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const _apiBase = ((import.meta.env.VITE_API_BASE_URL as string) || BASE).replace(/\/$/, "");
function apiUrl(path: string) { return `${_apiBase}/api${path}`; }

type EnrollmentRow = {
  _row: number;
  "Student Name": string;
  "Student Email": string;
  "Class Name": string;
  "Class Date": string;
  "Class Time": string;
  "Parent Email": string;
  "Status": string;
  "Override Action": string;
  "Teacher": string;
  "Teacher Email": string;
  "Zoom Link": string;
  "Class Type": string;
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Active") return "default";
  if (status === "Cancelled") return "secondary";
  if (status === "Late Cancellation") return "destructive";
  if (status === "Fee Waived") return "secondary";
  if (status === "Fee Confirmed") return "destructive";
  return "outline";
}

function isToday(dateStr: string): boolean {
  if (!dateStr || dateStr === "TBD") return false;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    );
  } catch {
    return false;
  }
}

export default function StudentPortal() {
  const { user } = useUser();
  const sheetId = localStorage.getItem(SHEET_KEY);
  const email = user?.primaryEmailAddress?.emailAddress || localStorage.getItem("edutrack_user_email") || "";
  const name = localStorage.getItem("edutrack_user_name") || user?.fullName || "";

  const todayStr = new Date().toLocaleDateString("en-AU", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const { data: allClasses, isLoading, error } = useQuery<EnrollmentRow[]>({
    queryKey: ["student-schedule", email, sheetId],
    enabled: !!email && !!sheetId,
    queryFn: async () => {
      const params = new URLSearchParams({
        studentEmail: email,
        sheetId: sheetId!,
        status: "Active",
      });
      const res = await fetch(apiUrl(`/enrollments?${params}`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const todayClasses = allClasses?.filter(c => isToday(c["Class Date"])) ?? [];
  const upcomingClasses = allClasses?.filter(c => !isToday(c["Class Date"])) ?? [];

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 max-w-4xl">
        <header className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {name ? `Welcome, ${name.split(" ")[0]}` : "My Schedule"}
          </h1>
          <p className="text-muted-foreground">{todayStr}</p>
        </header>

        {!sheetId && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">No Google Sheet linked. Please open the enrolment link from your school.</p>
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">Failed to load your schedule. Please try again.</p>
          </div>
        )}

        {!isLoading && !error && allClasses && (
          <>
            {/* Today's Classes */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  Today's Classes
                </h2>
                <Badge variant="secondary">{todayClasses.length}</Badge>
              </div>

              {todayClasses.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10 border border-dashed rounded-xl text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 opacity-30" />
                  <p className="text-sm font-medium">No classes scheduled for today</p>
                  <p className="text-xs">Enjoy your day!</p>
                </div>
              ) : (
                todayClasses.map(cls => <ClassCard key={cls._row} cls={cls} highlight />)
              )}
            </section>

            {/* Upcoming Classes */}
            {upcomingClasses.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-muted-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Upcoming Classes
                  </h2>
                  <Badge variant="outline">{upcomingClasses.length}</Badge>
                </div>
                {upcomingClasses.map(cls => <ClassCard key={cls._row} cls={cls} />)}
              </section>
            )}

            {allClasses.length === 0 && (
              <div className="text-center py-16 border border-dashed rounded-xl flex flex-col items-center gap-3 text-muted-foreground">
                <BookOpen className="h-10 w-10 opacity-30" />
                <p className="font-medium">No classes enrolled yet</p>
                <p className="text-sm">Your enrolled classes will appear here once the principal activates them.</p>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/classes">Browse Classes <ChevronRight className="w-3.5 h-3.5 ml-1" /></Link>
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

function ClassCard({ cls, highlight }: { cls: EnrollmentRow; highlight?: boolean }) {
  const isGroup = cls["Class Type"] === "Group";

  return (
    <Card className={highlight ? "border-primary/30 bg-primary/5" : ""}>
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${highlight ? "bg-primary text-white" : "bg-primary/10 text-primary"}`}>
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="space-y-1 min-w-0">
              <p className="font-semibold text-foreground">{cls["Class Name"] || "—"}</p>
              {cls["Teacher"] && (
                <p className="text-sm text-muted-foreground">
                  Teacher: <span className="text-foreground">{cls["Teacher"]}</span>
                </p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                {cls["Class Date"] && cls["Class Date"] !== "TBD" && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />{cls["Class Date"]}
                  </span>
                )}
                {cls["Class Time"] && cls["Class Time"] !== "TBD" && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />{cls["Class Time"]}
                  </span>
                )}
                {cls["Class Type"] && (
                  <span className="flex items-center gap-1">
                    {isGroup ? <Users className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    {cls["Class Type"]}
                  </span>
                )}
              </div>
              {cls["Zoom Link"] && (
                <a
                  href={cls["Zoom Link"]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5"
                >
                  <Video className="h-3 w-3" />
                  Join Zoom
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={statusVariant(cls["Status"])}>{cls["Status"]}</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
