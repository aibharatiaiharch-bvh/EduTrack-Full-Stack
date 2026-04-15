import { useEffect, useState } from "react";
import { useUser } from "@clerk/react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Users, User, AlertTriangle, Calendar, MapPin, UserCheck } from "lucide-react";

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

type ClassStudents = Record<string, EligibleStudent[]>;

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
  const [principalStudents, setPrincipalStudents] = useState<ClassStudents>({});

  const { data: classes, isLoading, error } = useQuery<SubjectWithCapacity[]>({
    queryKey: ["subjects-capacity", sheetId],
    enabled: !!sheetId,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/subjects/with-capacity?sheetId=${encodeURIComponent(sheetId!)}&status=active`));
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

  useEffect(() => {
    if (!isPrincipal || !sheetId || !classes?.length) return;
    const load = async () => {
      const next: ClassStudents = {};
      for (const cls of classes) {
        const res = await fetch(apiUrl(`/principals/students-availability?sheetId=${encodeURIComponent(sheetId)}&className=${encodeURIComponent(cls.Name)}`));
        if (!res.ok) continue;
        next[cls.Name] = await res.json();
      }
      setPrincipalStudents(next);
    };
    load();
  }, [classes, isPrincipal, sheetId]);

  function studentsForClass(cls: SubjectWithCapacity): EligibleStudent[] {
    if (isPrincipal) return principalStudents[cls.Name] || [];
    return eligibleStudents;
  }

  function resolveStudentEnrollment(cls: SubjectWithCapacity, student: EligibleStudent) {
    return Boolean(student.enrolled) || (cls.currentEnrolled >= cls.MaxCapacity && !isPrincipal);
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
      if (isPrincipal) {
        setPrincipalStudents(prev => ({
          ...prev,
          [subject.Name]: (prev[subject.Name] || []).map(student =>
            student.name === selectedStudent?.name ? { ...student, enrolled: true } : student
          ),
        }));
      }
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
              <div className="overflow-hidden rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-4 py-3 font-medium">Class</th>
                      <th className="px-4 py-3 font-medium">Details</th>
                      <th className="px-4 py-3 font-medium">Capacity</th>
                      <th className="px-4 py-3 font-medium">Join</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.map(cls => {
                      const isJoining = joiningRow === cls._row;
                      const canJoin = !cls.isFull || isPrincipal;
                      const spotsLeft = cls.MaxCapacity - cls.currentEnrolled;
                      const myStudents = studentsForClass(cls);
                      const selectableStudents = myStudents.filter(student => !resolveStudentEnrollment(cls, student));

                      return (
                        <tr key={cls._row} className="border-t">
                          <td className="px-4 py-4 align-top">
                            <div className="font-medium">{cls.Name}</div>
                            <div className="text-xs text-muted-foreground">{cls.Type}</div>
                          </td>
                          <td className="px-4 py-4 align-top text-muted-foreground">
                            <div>{cls.Teachers || "—"}</div>
                            <div>{cls.Days || "—"}</div>
                            <div>{cls.Room || "—"}</div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            <div className={`font-semibold ${capacityColor(cls)}`}>{cls.currentEnrolled} / {cls.MaxCapacity}</div>
                            <div className="text-xs text-muted-foreground">{spotsLeft} left</div>
                          </td>
                          <td className="px-4 py-4 align-top">
                            {isJoining ? (
                              <div className="space-y-2">
                                <select
                                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                  value={selectedStudent?.name || ""}
                                  onChange={e => {
                                    const s = selectableStudents.find(s => s.name === e.target.value) || null;
                                    setSelectedStudent(s);
                                    setManualName(s?.name || "");
                                    setManualEmail(s?.parentEmail || "");
                                  }}
                                  autoFocus
                                >
                                  <option value="">Select student</option>
                                  {selectableStudents.map(s => <option key={s.userId || s.name} value={s.name}>{s.name}</option>)}
                                </select>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="flex-1"
                                    disabled={joinMutation.isPending || (isPrincipal ? !manualName.trim() : !selectedStudent)}
                                    onClick={() => joinMutation.mutate(cls)}
                                  >
                                    {joinMutation.isPending ? "Saving…" : "Enroll"}
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => { setJoiningRow(null); setSelectedStudent(null); setManualName(""); }}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                className="w-full"
                                disabled={!canJoin && !isPrincipal}
                                onClick={() => { setJoiningRow(cls._row); setSelectedStudent(null); setManualName(""); }}
                              >
                                {cls.isFull && !isPrincipal ? "Full" : "Join"}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
