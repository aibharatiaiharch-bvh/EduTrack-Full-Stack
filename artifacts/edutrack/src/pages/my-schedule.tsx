import { Fragment } from "react";
import { useUser } from "@clerk/react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, BookOpen, Users, User, AlertTriangle, Video, ShieldCheck, GraduationCap } from "lucide-react";

const SHEET_KEY = "edutrack_sheet_id";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const _apiBase = ((import.meta.env.VITE_API_BASE_URL as string) || BASE).replace(/\/$/, "");
function apiUrl(path: string) { return `${_apiBase}/api${path}`; }

type EnrollmentRow = {
  _row: number;
  "Student Name": string;
  "Class Name": string;
  "Class Date": string;
  "Class Time": string;
  "Parent Email": string;
  "Status": string;
  "Fee": string;
  "Override Action": string;
  "Teacher": string;
  "Teacher Email": string;
  "Zoom Link": string;
  "Class Type": string;
};

type TeacherRow = {
  _row: number;
  "UserID": string;
  "Name": string;
  "Email": string;
  "Subjects": string;
  "Status": string;
  "Zoom Link": string;
};

type SubjectRow = {
  _row: number;
  "Subject Name": string;
  "Type": string;
  "Teachers": string;
  "Room": string;
  "Days": string;
};

function statusColor(status: string) {
  if (status === "Active")   return "default";
  if (status === "Inactive") return "secondary";
  // legacy backward compat
  if (status === "Cancelled" || status === "Fee Waived") return "secondary";
  if (status === "Late Cancellation" || status === "Fee Confirmed") return "destructive";
  return "outline";
}

export default function MySchedule() {
  const { user } = useUser();
  const sheetId = localStorage.getItem(SHEET_KEY);
  const email = user?.primaryEmailAddress?.emailAddress || localStorage.getItem("edutrack_user_email") || "";
  const role = localStorage.getItem("edutrack_user_role") || "tutor";
  const isSummaryView = role === "principal" || role === "developer" || role === "admin";

  const { data: classes, isLoading, error } = useQuery<EnrollmentRow[]>({
    queryKey: ["my-schedule", email, sheetId],
    enabled: !!sheetId,
    queryFn: async () => {
      const params = new URLSearchParams({ sheetId: sheetId! });
      if (!isSummaryView && email) params.set("teacherEmail", email);
      const res = await fetch(apiUrl(`/enrollments?${params}`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: teachers } = useQuery<TeacherRow[]>({
    queryKey: ["schedule-teachers", sheetId],
    enabled: isSummaryView && !!sheetId,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/principals/teachers?sheetId=${encodeURIComponent(sheetId!)}`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: subjects } = useQuery<SubjectRow[]>({
    queryKey: ["schedule-subjects", sheetId],
    enabled: isSummaryView && !!sheetId,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/subjects?sheetId=${encodeURIComponent(sheetId!)}`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const active = classes?.filter(c => c["Status"] === "Active") ?? [];
  const other = classes?.filter(c => c["Status"] !== "Active") ?? [];

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 max-w-4xl">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            {isSummaryView ? "Weekly Schedule Summary" : "My Schedule"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isSummaryView
              ? "Color-coded weekly overview of teachers, subjects, and class capacity."
              : <>Classes assigned to <span className="font-medium text-foreground">{email}</span></>}
          </p>
        </header>

        {!sheetId && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">No Google Sheet linked. Go to Settings to link your data source.</p>
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">Failed to load schedule. Please try again.</p>
          </div>
        )}

        {!isLoading && !error && classes && (
          <>
            {isSummaryView ? (
              <SummaryView classes={classes} teachers={teachers ?? []} subjects={subjects ?? []} />
            ) : active.length === 0 && other.length === 0 ? (
              <div className="text-center py-16 border border-dashed rounded-xl flex flex-col items-center gap-3 text-muted-foreground">
                <Calendar className="h-10 w-10 opacity-30" />
                <p className="font-medium">No classes assigned to your account yet</p>
                <p className="text-sm">Classes assigned to {email} will appear here.</p>
              </div>
            ) : (
              <>
                {active.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-semibold text-foreground">Active Classes</h2>
                      <Badge variant="secondary">{active.length}</Badge>
                    </div>
                    {active.map(cls => <ClassCard key={cls._row} cls={cls} />)}
                  </section>
                )}

                {other.length > 0 && (
                  <section className="space-y-3">
                    <h2 className="text-base font-semibold text-muted-foreground">Past / Cancelled</h2>
                    {other.map(cls => <ClassCard key={cls._row} cls={cls} muted />)}
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

function SummaryView({ classes, teachers, subjects }: { classes: EnrollmentRow[]; teachers: TeacherRow[]; subjects: SubjectRow[]; }) {
  const active = classes.filter(c => c["Status"] === "Active");
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const daySummary = days.map(day => ({
    day,
    classes: active.filter(cls => {
      const date = (cls["Class Date"] || "").toLowerCase();
      return date.includes(day.toLowerCase()) || date === "tbd" || !date;
    }),
  }));
  const rows = Array.from(new Set(subjects.map(s => s["Subject Name"]).filter(Boolean)));
  const countForClass = (name: string) => active.filter(cls => cls["Class Name"] === name).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Open</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Filling</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Full</span>
      </div>
      <div className="grid gap-3 overflow-x-auto">
        <div className="min-w-[900px] grid grid-cols-[160px_repeat(5,minmax(0,1fr))] gap-2">
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-[11px] font-semibold text-center">Class / Subject</div>
          {daySummary.map(({ day }) => (
            <div key={day} className="rounded-lg border bg-muted/40 px-3 py-2 text-[11px] font-semibold text-center">
              {day}
            </div>
          ))}

          {rows.map((rowName) => {
            const relatedClasses = active.filter(cls =>
              (cls["Class Name"] || "").toLowerCase().includes(rowName.toLowerCase())
            );
            const teacherNames = Array.from(new Set(relatedClasses.map(c => c["Teacher"]).filter(Boolean)));
            const rowCount = relatedClasses.length;
            return (
              <Fragment key={rowName}>
                <div className="rounded-lg border bg-background px-3 py-2 text-sm font-medium">
                  <div className="truncate text-[11px]">{rowName}</div>
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{teacherNames.join(", ") || "No teacher"}</div>
                </div>
                {daySummary.map(({ day }) => {
                  const dayClass = relatedClasses.find(cls =>
                    (cls["Class Date"] || "").toLowerCase().includes(day.toLowerCase())
                  );
                  const tone = dayClass ? (dayClass["Class Type"] === "Group" ? "red" : dayClass["Class Type"] === "Both" ? "yellow" : "green") : "green";
                  return (
                    <div
                      key={`${rowName}-${day}`}
                      className={
                        `min-h-[72px] rounded-lg border px-2 py-1.5 text-[9px] leading-tight ${tone === "red" ? "bg-red-50 border-red-200" : tone === "yellow" ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`
                      }
                    >
                      {dayClass ? (
                        <div className="space-y-0.5">
                          <p className="font-semibold text-foreground truncate">{dayClass["Class Date"] || day}</p>
                          <p className="text-muted-foreground truncate">{dayClass["Class Name"]}</p>
                          <p className="text-muted-foreground truncate">{dayClass["Teacher"]}</p>
                          <p className="uppercase tracking-wide">
                            Count: {countForClass(dayClass["Class Name"])} • {tone === "red" ? "Full" : tone === "yellow" ? "Filling" : "Open"}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-0.5 text-green-800">
                          <p className="font-semibold truncate">{rowName}</p>
                          <p className="truncate">{teacherNames.join(", ") || "No teacher"}</p>
                          <p className="uppercase tracking-wide">Count: {rowCount} • Open</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon, title, value, tone }: { icon: React.ReactNode; title: string; value: string; tone: "red" | "yellow" | "green"; }) {
  const toneClass = tone === "red" ? "border-red-200 bg-red-50 text-red-700" : tone === "yellow" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-green-200 bg-green-50 text-green-700";
  return (
    <Card className={toneClass}>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="text-sm opacity-80">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        {icon}
      </CardContent>
    </Card>
  );
}

function ClassCard({ cls, muted }: { cls: EnrollmentRow; muted?: boolean }) {
  const typeIcon = cls["Class Type"] === "Individual"
    ? <User className="h-4 w-4" />
    : <Users className="h-4 w-4" />;

  return (
    <Card className={muted ? "opacity-60" : ""}>
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="space-y-1 min-w-0">
              <p className="font-semibold text-foreground">{cls["Class Name"]}</p>
              <p className="text-sm text-muted-foreground">Student: <span className="text-foreground">{cls["Student Name"]}</span></p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                {cls["Class Date"] && cls["Class Date"] !== "TBD" && (
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{cls["Class Date"]}</span>
                )}
                {cls["Class Time"] && cls["Class Time"] !== "TBD" && (
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{cls["Class Time"]}</span>
                )}
                {cls["Class Type"] && (
                  <span className="flex items-center gap-1">{typeIcon}{cls["Class Type"]}</span>
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
          <div className="flex flex-col items-end gap-0.5 shrink-0">
            <Badge variant={statusColor(cls["Status"])}>{cls["Status"] || "Active"}</Badge>
            {cls["Status"] === "Inactive" && cls["Fee"] && cls["Fee"] !== "Not Applicable" && (
              <span className="text-xs text-muted-foreground">Fee: {cls["Fee"]}</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
