import { useState } from "react";
import { useUser } from "@clerk/react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Users, User, AlertTriangle, Calendar, MapPin, UserCheck, ChevronDown } from "lucide-react";

const SHEET_KEY = "edutrack_sheet_id";
const ROLE_KEY = "edutrack_user_role";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

type SubjectWithCapacity = {
  _row: number;
  SubjectID: string;
  Name: string;
  Type: string;
  Teachers: string;
  Room: string;
  Days: string;
  Status: string;
  MaxCapacity: number;
  currentEnrolled: number;
  isFull: boolean;
};

type EligibleStudent = {
  name: string;
  email: string;
  userId: string;
  parentEmail: string;
  classes: string;
  enrolled?: boolean;
};

export default function BrowseClasses() {
  const { user } = useUser();
  const sheetId = localStorage.getItem(SHEET_KEY);
  const role = localStorage.getItem(ROLE_KEY) || "tutor";
  const email = user?.primaryEmailAddress?.emailAddress || "";

  const isPrincipal = role === "principal" || role === "admin" || role === "developer";
  const isParent = role === "parent";
  const isStudent = role === "student";

  const { toast } = useToast();
  const qc = useQueryClient();

  const [joiningRow, setJoiningRow] = useState<number | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<EligibleStudent | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualEmail, setManualEmail] = useState(email);

  const { data: classes, isLoading, error } = useQuery<SubjectWithCapacity[]>({
    queryKey: ["subjects-capacity", sheetId],
    enabled: !!sheetId,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/subjects/with-capacity?sheetId=${encodeURIComponent(sheetId!)}&status=active`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: availability = [], isLoading: loadingAvailability } = useQuery<EligibleStudent[]>({
    queryKey: ["students-availability", sheetId],
    enabled: !!sheetId && isPrincipal,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/principals/students-availability?sheetId=${encodeURIComponent(sheetId!)}&className=`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const { data: eligibleStudents = [], isLoading: loadingStudents } = useQuery<EligibleStudent[]>({
    queryKey: ["eligible-students", sheetId, email, role],
    enabled: !!sheetId && !!email && (isParent || isStudent),
    queryFn: async () => {
      const params = new URLSearchParams({ sheetId: sheetId! });
      if (isParent) params.set("parentEmail", email);
      if (isStudent) params.set("studentEmail", email);
      const res = await fetch(apiUrl(`/principals/eligible-students?${params}`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  function studentsForClass(cls: SubjectWithCapacity): EligibleStudent[] {
    if (isPrincipal) return availability;
    return eligibleStudents;
  }

  const joinMutation = useMutation({
    mutationFn: async (subject: SubjectWithCapacity) => {
      const studentName = isPrincipal ? manualName.trim() : (selectedStudent?.name || manualName.trim());
      const parentEmail = isPrincipal ? manualEmail.trim() : (selectedStudent?.parentEmail || manualEmail.trim());
      if (!studentName) throw new Error("Please select or enter a student name.");

      const res = await fetch(apiUrl("/enrollments/join"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId,
          studentName,
          parentEmail,
          subjectName: subject.Name,
          subjectType: subject.Type,
          teacherName: subject.Teachers,
          teacherEmail: "",
          zoomLink: "",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (_, subject) => {
      qc.invalidateQueries({ queryKey: ["subjects-capacity"] });
      const name = isPrincipal ? manualName : (selectedStudent?.name || manualName);
      toast({ title: "Enrolled!", description: `${name} has been added to ${subject.Name}.` });
      setJoiningRow(null);
      setSelectedStudent(null);
      setManualName("");
    },
    onError: (err: any) => {
      toast({ title: "Enrollment failed", description: err.message, variant: "destructive" });
    },
  });

  function capacityColor(cls: SubjectWithCapacity) {
    const pct = cls.currentEnrolled / cls.MaxCapacity;
    if (pct >= 1) return "text-destructive";
    if (pct >= 0.75) return "text-amber-600";
    return "text-emerald-600";
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 max-w-5xl">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Available Classes</h1>
          <p className="text-muted-foreground mt-1">Browse all active class offerings and manage enrolment.</p>
        </header>

        {!sheetId && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">No Google Sheet linked. Go to Settings to link your data source.</p>
          </div>
        )}

        {!loadingStudents && (isParent || isStudent) && eligibleStudents.length === 0 && sheetId && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">No active students are linked to your account. A principal must activate your student account before you can join classes.</p>
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-xl" />
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">Failed to load classes. Please try again.</p>
          </div>
        )}

        {!isLoading && !error && classes && (
          <>
            {classes.length === 0 ? (
              <div className="text-center py-16 border border-dashed rounded-xl flex flex-col items-center gap-3 text-muted-foreground">
                <BookOpen className="h-10 w-10 opacity-30" />
                <p className="font-medium">No active classes found</p>
                <p className="text-sm">Add subjects in the Principal Dashboard to see them here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {classes.map(cls => {
                  const isJoining = joiningRow === cls._row;
                  const canJoin = !cls.isFull || isPrincipal;
                  const spotsLeft = cls.MaxCapacity - cls.currentEnrolled;
                  const myStudents = studentsForClass(cls);
                  const hasEligible = isPrincipal || myStudents.length > 0;

                  return (
                    <Card key={cls._row} className={`overflow-hidden transition-shadow hover:shadow-md ${cls.isFull && !isPrincipal ? "opacity-80" : ""}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-base">{cls.Name}</CardTitle>
                            <CardDescription className="mt-0.5">
                              {cls.Type === "Individual"
                                ? <span className="flex items-center gap-1"><User className="h-3 w-3" /> Individual (1-on-1)</span>
                                : cls.Type === "Group"
                                  ? <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Group</span>
                                  : <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Individual &amp; Group</span>
                              }
                            </CardDescription>
                          </div>
                          {cls.isFull
                            ? <Badge variant="destructive">Full</Badge>
                            : <Badge variant="secondary" className="text-emerald-700 bg-emerald-50">{spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left</Badge>
                          }
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-3 pt-0">
                        <div className="space-y-1 text-sm text-muted-foreground">
                          {cls.Teachers && (
                            <p className="flex items-center gap-1.5">
                              <UserCheck className="h-3.5 w-3.5 shrink-0" />
                              {cls.Teachers}
                            </p>
                          )}
                          {cls.Days && (
                            <p className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 shrink-0" />
                              {cls.Days}
                            </p>
                          )}
                          {cls.Room && (
                            <p className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              {cls.Room}
                            </p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Enrolment</span>
                            <span className={`font-semibold ${capacityColor(cls)}`}>
                              {cls.currentEnrolled} / {cls.MaxCapacity}
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                cls.isFull ? "bg-destructive" :
                                cls.currentEnrolled / cls.MaxCapacity >= 0.75 ? "bg-amber-500" :
                                "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.min(100, (cls.currentEnrolled / cls.MaxCapacity) * 100)}%` }}
                            />
                          </div>
                        </div>

                        {isPrincipal && (
                          <div className="space-y-2">
                            <div className="text-xs font-medium text-muted-foreground">Active students</div>
                            <div className="flex flex-wrap gap-2">
                              {myStudents.map(student => {
                                const enrolled = Boolean(student.enrolled);
                                return (
                                  <span
                                    key={student.userId || student.email || student.name}
                                    className={`rounded-full px-2.5 py-1 text-xs border ${
                                      enrolled
                                        ? "bg-muted text-muted-foreground border-border"
                                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    }`}
                                  >
                                    {student.name}{enrolled ? " · enrolled" : " · eligible"}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {isJoining ? (
                          <div className="space-y-2 pt-1">
                            {isPrincipal ? (
                              <>
                                <input
                                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                  placeholder="Student name *"
                                  value={manualName}
                                  onChange={e => setManualName(e.target.value)}
                                  autoFocus
                                />
                                <input
                                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                  placeholder="Parent email"
                                  value={manualEmail}
                                  onChange={e => setManualEmail(e.target.value)}
                                />
                              </>
                            ) : myStudents.length === 0 ? (
                              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                No active students linked to your account. Contact the principal to activate your student.
                              </div>
                            ) : (
                              <div className="relative">
                                <select
                                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm appearance-none focus:outline-none focus:ring-2 focus:ring-ring pr-8"
                                  value={selectedStudent?.name || ""}
                                  onChange={e => {
                                    const s = myStudents.find(s => s.name === e.target.value) || null;
                                    setSelectedStudent(s);
                                  }}
                                  autoFocus
                                >
                                  <option value="">— Select student —</option>
                                  {myStudents.map(s => (
                                    <option key={s.userId || s.name} value={s.name}>
                                      {s.name}{cls.Type === "Individual" ? " (1-on-1)" : ""}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                              </div>
                            )}

                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="flex-1"
                                disabled={
                                  joinMutation.isPending ||
                                  (isPrincipal ? !manualName.trim() : (!selectedStudent && myStudents.length > 0))
                                }
                                onClick={() => joinMutation.mutate(cls)}
                              >
                                {joinMutation.isPending ? "Enrolling…" : "Confirm Enrol"}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setJoiningRow(null); setSelectedStudent(null); setManualName(""); }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2 pt-1">
                            {!hasEligible && !isPrincipal ? (
                              <Button size="sm" className="flex-1" disabled title="No active students linked to your account">
                                Not Eligible
                              </Button>
                            ) : canJoin ? (
                              <Button
                                size="sm"
                                className="flex-1"
                                onClick={() => { setJoiningRow(cls._row); setSelectedStudent(null); setManualName(""); }}
                              >
                                Join Class
                              </Button>
                            ) : (
                              <Button size="sm" className="flex-1" disabled>
                                Class Full
                              </Button>
                            )}
                            {isPrincipal && cls.isFull && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                                onClick={() => { setJoiningRow(cls._row); setSelectedStudent(null); setManualName(""); }}
                              >
                                Override
                              </Button>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
