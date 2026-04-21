import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout, PublicLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Clock, Users, BookOpen, UserRound, AlertCircle, Mail } from "lucide-react";
import { apiUrl } from "@/lib/api";

const SHORT_DAY: Record<string, string> = {
  Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed",
  Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Student {
  name: string;
  email: string;
}

interface Slot {
  subjectId: string;
  className: string;
  type: string;
  teacherName: string;
  teacherEmail: string;
  enrolled: number;
  maxCapacity: number;
  students: Student[];
  time: string;
  room: string;
}

interface ApiDay {
  date: string;
  dateISO: string;
  dayName: string;
  slots: Slot[];
}

interface CalendarApiResponse {
  days: ApiDay[];
  principalEmail: string;
}

interface SubjectRow {
  className: string;
  type: string;
  daySlots: Partial<Record<string, Slot>>;
}

function seatStyle(slot: Slot) {
  if (slot.type === "Individual") return "bg-emerald-50 text-emerald-900 border-emerald-200";
  // Use the actual per-day student list (same source as the hover popover)
  // so the color matches what the user sees enrolled for that specific day.
  const count = slot.students.length;
  if (count >= 8) return "bg-red-100 text-red-900 border-red-200";
  if (count >= 6) return "bg-amber-100 text-amber-900 border-amber-200";
  return "bg-emerald-50 text-emerald-900 border-emerald-200";
}

function transformToGrid(days: ApiDay[]): { group: SubjectRow[]; individual: SubjectRow[] } {
  const map = new Map<string, SubjectRow>();
  for (const day of days) {
    const short = SHORT_DAY[day.dayName] ?? day.dayName.slice(0, 3);
    for (const slot of day.slots) {
      const key = `${slot.className}||${slot.type}`;
      if (!map.has(key)) {
        map.set(key, { className: slot.className, type: slot.type, daySlots: {} });
      }
      map.get(key)!.daySlots[short] = slot;
    }
  }
  const rows = Array.from(map.values()).sort((a, b) => a.className.localeCompare(b.className));
  return {
    group: rows.filter(r => r.type !== "Individual"),
    individual: rows.filter(r => r.type === "Individual"),
  };
}

function SlotBox({ slot, canSeeStudents }: { slot: Slot; canSeeStudents: boolean }) {
  const style = seatStyle(slot);
  const [open, setOpen] = useState(false);
  const box = (
    <div
      className={`min-h-[52px] rounded-md border px-2 py-1.5 ${style} ${canSeeStudents ? "cursor-pointer hover:brightness-95 active:brightness-90 transition-all" : ""}`}
    >
      <div className="flex items-center gap-1 text-[10px] font-semibold">
        <Clock className="h-3 w-3 shrink-0" />
        <span className="truncate">{slot.time || "—"}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-1 text-[10px]">
        <span className="truncate flex items-center gap-1 min-w-0">
          <UserRound className="h-3 w-3 shrink-0" />
          <span className="truncate">{slot.teacherName || "—"}</span>
        </span>
      </div>
    </div>
  );

  if (!canSeeStudents) return box;

  // Use Radix Popover (which renders into a Portal) so the popover escapes
  // the table's overflow-x-auto container instead of being clipped.
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        asChild
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
      >
        {box}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-60 p-3"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <p className="text-xs font-semibold mb-2">
          {slot.className} — {slot.students.length} enrolled
        </p>
        {slot.students.length === 0 ? (
          <p className="text-xs text-muted-foreground">No students yet</p>
        ) : (
          <ul className="space-y-0.5 max-h-64 overflow-y-auto">
            {slot.students.map((s, i) => (
              <li key={i} className="text-xs flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">
                  {s.name.charAt(0).toUpperCase()}
                </span>
                {s.name}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function CalendarGrid({ rows, title, canSeeStudents }: { rows: SubjectRow[]; title: string; canSeeStudents: boolean }) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="min-w-[760px] w-full text-xs border-collapse">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-2 py-1.5 font-medium sticky left-0 bg-muted/50 min-w-[140px]">Class</th>
              {DAYS.map(d => (
                <th key={d} className="text-left px-2 py-1.5 font-medium min-w-[120px]">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={`${row.className}-${row.type}`} className="border-b last:border-0 align-top">
                <td className="px-2 py-2 sticky left-0 bg-background font-medium">
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {row.className}
                  </div>
                </td>
                {DAYS.map(day => {
                  const slot = row.daySlots[day];
                  return (
                    <td key={day} className="px-2 py-2 align-top">
                      {slot ? (
                        <SlotBox slot={slot} canSeeStudents={canSeeStudents} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

interface ContactRow {
  className: string;
  day: string;
  time: string;
  teacherName: string;
  teacherEmail: string;
  students: Student[];
}

const DAY_ORDER: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function buildContactRows(days: ApiDay[]): ContactRow[] {
  // One row per (className, day) — matches what the calendar hover shows for that day.
  const seen = new Set<string>();
  const rows: ContactRow[] = [];
  for (const day of days) {
    const short = SHORT_DAY[day.dayName] ?? day.dayName.slice(0, 3);
    for (const slot of day.slots) {
      const key = `${slot.className}||${short}||${slot.time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        className: slot.className,
        day: short,
        time: slot.time,
        teacherName: slot.teacherName,
        teacherEmail: slot.teacherEmail,
        students: slot.students,
      });
    }
  }
  return rows.sort((a, b) =>
    a.className.localeCompare(b.className) ||
    (DAY_ORDER[a.day] ?? 99) - (DAY_ORDER[b.day] ?? 99)
  );
}

function ContactTable({ days, principalEmail }: { days: ApiDay[]; principalEmail: string }) {
  const rows = buildContactRows(days);
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Contact Directory
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Click any email link to open your mail client with the address pre-filled.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="min-w-[640px] w-full text-xs border-collapse">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-2 py-1.5 font-medium min-w-[140px]">Class</th>
              <th className="text-left px-2 py-1.5 font-medium min-w-[50px]">Day</th>
              <th className="text-left px-2 py-1.5 font-medium min-w-[80px]">Time</th>
              <th className="text-left px-2 py-1.5 font-medium min-w-[100px]">Tutor</th>
              {principalEmail && (
                <th className="text-left px-2 py-1.5 font-medium min-w-[100px]">Principal</th>
              )}
              <th className="text-left px-2 py-1.5 font-medium min-w-[180px]">Students</th>
              <th className="text-left px-2 py-1.5 font-medium min-w-[100px]">All Emails</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const subject = encodeURIComponent(`Re: ${row.className} class (${row.day})`);
              const teacherMailto = row.teacherEmail
                ? `mailto:${row.teacherEmail}?subject=${subject}`
                : null;
              const principalMailto = principalEmail
                ? `mailto:${principalEmail}${row.teacherEmail ? `?cc=${encodeURIComponent(row.teacherEmail)}` : ""}&subject=${subject}`
                : null;

              // "Email All" — TO: teacher, CC: principal + all students with emails
              const allEmails = [
                row.teacherEmail,
                principalEmail,
                ...row.students.map(s => s.email).filter(Boolean),
              ].filter(Boolean);
              const uniqueEmails = [...new Set(allEmails)];
              const toEmail = uniqueEmails[0] || '';
              const ccEmails = uniqueEmails.slice(1).join(',');
              const emailAllHref = toEmail
                ? `mailto:${toEmail}${ccEmails ? `?cc=${encodeURIComponent(ccEmails)}` : ''}&subject=${subject}`
                : null;

              return (
                <tr key={i} className="border-b last:border-0 align-top hover:bg-muted/30">
                  <td className="px-2 py-2 font-medium">{row.className}</td>
                  <td className="px-2 py-2 text-muted-foreground">{row.day}</td>
                  <td className="px-2 py-2 text-muted-foreground">{row.time || "—"}</td>
                  <td className="px-2 py-2">
                    {teacherMailto ? (
                      <a href={teacherMailto} className="text-blue-600 hover:underline flex items-center gap-1">
                        <Mail className="h-3 w-3 shrink-0" />
                        Tutor
                      </a>
                    ) : (
                      <span className="text-muted-foreground">{row.teacherName || "—"}</span>
                    )}
                  </td>
                  {principalEmail && (
                    <td className="px-2 py-2">
                      {principalMailto ? (
                        <a
                          href={principalMailto}
                          className="text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Mail className="h-3 w-3 shrink-0" />
                          Principal
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-2 py-2">
                    {row.students.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {row.students.map((s, j) => (
                          s.email ? (
                            <a
                              key={j}
                              href={`mailto:${s.email}?subject=${encodeURIComponent(`Re: ${row.className} class`)}`}
                              className="text-blue-600 hover:underline"
                            >
                              {s.name}
                            </a>
                          ) : (
                            <span key={j} className="text-muted-foreground">{s.name}</span>
                          )
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {emailAllHref ? (
                      <a
                        href={emailAllHref}
                        className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700 transition-colors"
                      >
                        <Mail className="h-3 w-3 shrink-0" />
                        Email All
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CalendarContent() {
  const canSeeStudents = true;

  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/config"));
      if (!res.ok) throw new Error("config unavailable");
      const d = await res.json();
      if (d.sheetId) localStorage.setItem("edutrack_sheet_id", d.sheetId);
      return d as { sheetId: string };
    },
    enabled: !localStorage.getItem("edutrack_sheet_id"),
    staleTime: Infinity,
  });

  const sheetId = localStorage.getItem("edutrack_sheet_id") || configData?.sheetId || "";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["calendar", sheetId],
    queryFn: async () => {
      const url = apiUrl(`/schedule/calendar?sheetId=${encodeURIComponent(sheetId)}&weeks=1`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      return res.json() as Promise<CalendarApiResponse>;
    },
    enabled: !!sheetId,
    staleTime: 5 * 60 * 1000,
  });

  if (configLoading || isLoading || (!sheetId && !isError)) {
    return (
      <div className="p-4 md:p-8 space-y-4 max-w-7xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[160px] w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive font-medium">Could not load schedule</p>
        <p className="text-xs text-muted-foreground">{(error as Error)?.message}</p>
      </div>
    );
  }

  const days = data?.days ?? [];
  const principalEmail = data?.principalEmail ?? "";
  const { group, individual } = transformToGrid(days);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl">
      <header className="space-y-1">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Class Calendar</h1>
        <p className="text-muted-foreground text-sm">
          Live schedule from Google Sheets.
          {canSeeStudents && " Click any class box to see enrolled students."}
        </p>
      </header>

      {group.length === 0 && individual.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">No active classes found for this week.</p>
      ) : (
        <>
          <CalendarGrid rows={group} title="Group Classes" canSeeStudents={canSeeStudents} />
          <CalendarGrid rows={individual} title="Individual Classes" canSeeStudents={canSeeStudents} />
          {/* Contact Directory moved to Principal → Requests tab for data privacy. */}
          {false && <ContactTable days={days} principalEmail={principalEmail} />}
        </>
      )}
    </div>
  );
}

export default function ClassCalendar() {
  const role = localStorage.getItem("edutrack_user_role") || "";
  const isLoggedIn = !!role;

  if (isLoggedIn) {
    return (
      <AppLayout>
        <CalendarContent />
      </AppLayout>
    );
  }

  return (
    <PublicLayout>
      <CalendarContent />
    </PublicLayout>
  );
}
