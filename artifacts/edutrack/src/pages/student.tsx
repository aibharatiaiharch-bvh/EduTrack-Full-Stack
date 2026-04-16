import { useState, useEffect } from "react";
import { useSignOut } from "@/hooks/use-sign-out";
import { apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NotificationPrompt } from "@/components/NotificationPrompt";
import {
  GraduationCap, LogOut, RefreshCw, Video, Calendar, Clock,
  AlertTriangle, BookOpen, Users, User,
} from "lucide-react";

const sheetId = () => localStorage.getItem("edutrack_sheet_id") || "";

async function apiFetch(path: string, options?: RequestInit) {
  const sid = sheetId();
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(apiUrl(`${path}${sep}sheetId=${encodeURIComponent(sid)}`), {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res.json();
}

type Enrollment = {
  _row: number;
  EnrollmentID: string;
  ClassID: string;
  Status: string;
  "Class Name": string;
  "Class Date": string;
  "Class Time": string;
  "Teacher": string;
  "Zoom Link": string;
  "Class Type": string;
};

/** Compute whether the next occurrence of 'days' at 'time' is within 24 h. */
function nextSessionWithin24h(days: string, time: string): boolean {
  if (!days || !time) return false;
  const dayMap: Record<string, number> = {
    sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2,
    wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
  };
  const todayDay = new Date().getDay();
  const parts = days.toLowerCase().split(/[,;\/\s]+/).map(d => d.trim()).filter(Boolean);
  const timeParts = time.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  let h = 0, m = 0;
  if (timeParts) {
    h = parseInt(timeParts[1], 10);
    m = parseInt(timeParts[2] || "0", 10);
    const p = (timeParts[3] || "").toLowerCase();
    if (p === "pm" && h !== 12) h += 12;
    if (p === "am" && h === 12) h = 0;
  }
  for (const part of parts) {
    const target = dayMap[part];
    if (target === undefined) continue;
    let diff = (target - todayDay + 7) % 7;
    const candidate = new Date();
    candidate.setDate(candidate.getDate() + diff);
    candidate.setHours(h, m, 0, 0);
    if (candidate.getTime() < Date.now()) {
      candidate.setDate(candidate.getDate() + 7);
    }
    const msUntil = candidate.getTime() - Date.now();
    if (msUntil <= 24 * 60 * 60 * 1000) return true;
  }
  return false;
}

function CancelModal({ name, days, time, onConfirm, onClose, confirming }: {
  name: string; days: string; time: string;
  onConfirm: () => void; onClose: () => void; confirming: boolean;
}) {
  const isLate = nextSessionWithin24h(days, time);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${isLate ? "text-amber-500" : "text-red-500"}`} />
            <div>
              <p className="font-medium">Cancel enrollment in {name}?</p>
              {isLate ? (
                <p className="text-sm text-amber-700 mt-1">
                  The next session is <strong>within 24 hours</strong>. This will be flagged as a late cancellation and may attract a fee at the principal's discretion.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  Your recurring enrollment will end. You won't attend future sessions of this class.
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onClose} disabled={confirming}>Keep it</Button>
            <Button
              size="sm"
              disabled={confirming}
              className={isLate
                ? "bg-amber-600 hover:bg-amber-700 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"}
              onClick={onConfirm}
            >
              {confirming ? "Cancelling…" : isLate ? "Cancel (late — fee may apply)" : "Yes, cancel"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function StudentDashboard() {
  const signOut  = useSignOut();
  const name     = localStorage.getItem("edutrack_user_name") || "Student";
  const userId   = localStorage.getItem("edutrack_user_id")   || "";

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [subjectMap,  setSubjectMap]  = useState<Record<string, any>>({});
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [cancelling,  setCancelling]  = useState<Enrollment | null>(null);
  const [confirming,  setConfirming]  = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const [enrData, subData] = await Promise.all([
        apiFetch(`/enrollments?userId=${encodeURIComponent(userId)}&status=approved,active`),
        apiFetch("/subjects?status=active"),
      ]);
      if (Array.isArray(enrData)) setEnrollments(enrData);
      else setError("Could not load your classes.");
      if (Array.isArray(subData)) {
        const m: Record<string, any> = {};
        for (const s of subData) m[s["SubjectID"] || s.SubjectID || ""] = s;
        setSubjectMap(m);
      }
    } catch { setError("Connection error."); }
    setLoading(false);
  }

  useEffect(() => { if (userId) load(); }, [userId]);

  async function confirmCancel() {
    if (!cancelling) return;
    setConfirming(true);
    try {
      const data = await apiFetch(`/enrollments/${cancelling._row}/cancel`, {
        method: "POST",
        body: JSON.stringify({ sheetId: sheetId() }),
      });
      if (data.ok) {
        setCancelling(null);
        await load();
      } else {
        setError(data.error || "Cancellation failed.");
        setCancelling(null);
      }
    } catch { setError("Connection error."); setCancelling(null); }
    setConfirming(false);
  }

  const active = enrollments.filter(e =>
    ["approved", "active"].includes((e.Status || "").toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">EduTrack</span>
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Student</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground hidden sm:block">{name}</span>
          <Button variant="ghost" size="sm" className="gap-2" onClick={signOut}>
            <LogOut className="w-4 h-4" /> Sign Out
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <NotificationPrompt />

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">My Classes</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              You're automatically enrolled each week until you cancel.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!loading && active.length === 0 && (
          <div className="text-center py-16 border border-dashed rounded-xl flex flex-col items-center gap-3 text-muted-foreground">
            <BookOpen className="h-10 w-10 opacity-30" />
            <p className="font-medium">No active classes</p>
            <p className="text-sm">Your classes will appear here once the principal enrols you.</p>
          </div>
        )}

        <div className="space-y-3">
          {active.map(enr => {
            const sub  = subjectMap[enr.ClassID] || {};
            const days = sub.Days || sub["Days"] || "";
            const time = sub.Time || sub["Time"] || (enr["Class Time"] !== "TBD" ? enr["Class Time"] : "");
            const isLate = nextSessionWithin24h(days, time);
            const isGroup = (enr["Class Type"] || "").toLowerCase() === "group";

            return (
              <Card key={enr.EnrollmentID || enr._row}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="font-medium">{enr["Class Name"]}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                        {days && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />{days}
                          </span>
                        )}
                        {time && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />{time}
                          </span>
                        )}
                        {enr["Class Type"] && (
                          <span className="flex items-center gap-1">
                            {isGroup ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}
                            {enr["Class Type"]}
                          </span>
                        )}
                      </div>
                      {enr["Teacher"] && (
                        <p className="text-xs text-muted-foreground">Teacher: <span className="text-foreground">{enr["Teacher"]}</span></p>
                      )}
                    </div>
                    <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 shrink-0 text-xs">
                      Active
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap pt-1 border-t">
                    {enr["Zoom Link"] && (
                      <a
                        href={enr["Zoom Link"]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        <Video className="w-3 h-3" /> Join Zoom
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className={`text-xs ml-auto gap-1 ${isLate
                        ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                        : "border-red-200 text-red-600 hover:bg-red-50"}`}
                      onClick={() => setCancelling(enr)}
                    >
                      {isLate && <AlertTriangle className="w-3 h-3" />}
                      Cancel enrollment
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {active.length > 0 && (
          <p className="text-xs text-muted-foreground mt-6">
            Cancellations within 24 hours of a session may be flagged as late cancellations and may attract a fee.
          </p>
        )}
      </main>

      {cancelling && (() => {
        const sub  = subjectMap[cancelling.ClassID] || {};
        const days = sub.Days || sub["Days"] || "";
        const time = sub.Time || sub["Time"] || "";
        return (
          <CancelModal
            name={cancelling["Class Name"]}
            days={days}
            time={time}
            onConfirm={confirmCancel}
            onClose={() => setCancelling(null)}
            confirming={confirming}
          />
        );
      })()}
    </div>
  );
}
