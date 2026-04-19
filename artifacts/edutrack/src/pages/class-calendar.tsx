import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout, PublicLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Clock, Users, BookOpen, UserRound, AlertCircle } from "lucide-react";
import { apiUrl } from "@/lib/api";

const SHORT_DAY: Record<string, string> = {
  Monday: "Mon", Tuesday: "Tue", Wednesday: "Wed",
  Thursday: "Thu", Friday: "Fri", Saturday: "Sat", Sunday: "Sun",
};
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Slot {
  subjectId: string;
  className: string;
  type: string;
  teacherName: string;
  enrolled: number;
  maxCapacity: number;
  students: string[];
  time: string;
  room: string;
}

interface ApiDay {
  date: string;
  dateISO: string;
  dayName: string;
  slots: Slot[];
}

interface SubjectRow {
  className: string;
  type: string;
  daySlots: Partial<Record<string, Slot>>;
}

function seatStyle(slot: Slot) {
  if (slot.type === "Individual") return "bg-emerald-50 text-emerald-900 border-emerald-200";
  if (slot.enrolled >= slot.maxCapacity) return "bg-red-100 text-red-900 border-red-200";
  if (slot.enrolled >= slot.maxCapacity * 0.7) return "bg-amber-100 text-amber-900 border-amber-200";
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

function SlotBox({
  slot,
  canSeeStudents,
}: {
  slot: Slot;
  canSeeStudents: boolean;
}) {
  const style = seatStyle(slot);
  const box = (
    <div className={`min-h-[52px] rounded-md border px-2 py-1.5 ${style} ${canSeeStudents ? "cursor-pointer hover:brightness-95 active:brightness-90 transition-all" : ""}`}>
      <div className="flex items-center gap-1 text-[10px] font-semibold">
        <Clock className="h-3 w-3 shrink-0" />
        <span className="truncate">{slot.time || "—"}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-1 text-[10px]">
        <span className="truncate flex items-center gap-1 min-w-0">
          <UserRound className="h-3 w-3 shrink-0" />
          <span className="truncate">{slot.teacherName || "—"}</span>
        </span>
        <span className="shrink-0 flex items-center gap-1">
          <Users className="h-3 w-3" />
          {slot.enrolled}/{slot.maxCapacity}
        </span>
      </div>
    </div>
  );

  if (!canSeeStudents) return box;

  return (
    <Popover>
      <PopoverTrigger asChild>{box}</PopoverTrigger>
      <PopoverContent className="w-56 p-3" side="top">
        <p className="text-xs font-semibold mb-2">
          {slot.className} — {slot.students.length} enrolled
        </p>
        {slot.students.length === 0 ? (
          <p className="text-xs text-muted-foreground">No students yet</p>
        ) : (
          <ul className="space-y-0.5">
            {slot.students.map((s, i) => (
              <li key={i} className="text-xs flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">
                  {s.charAt(0).toUpperCase()}
                </span>
                {s}
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

function CalendarContent() {
  const sheetId = localStorage.getItem("edutrack_sheet_id") || "";
  const role = localStorage.getItem("edutrack_user_role") || "";
  const canSeeStudents = role === "principal" || role === "developer" || role === "admin";

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["calendar", sheetId],
    queryFn: async () => {
      const url = apiUrl(`/schedule/calendar?sheetId=${encodeURIComponent(sheetId)}&weeks=1`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      return res.json() as Promise<{ days: ApiDay[] }>;
    },
    enabled: !!sheetId,
    staleTime: 2 * 60 * 1000,
  });

  if (!sheetId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-4">
        <AlertCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground text-sm max-w-xs">
          Sheet ID not configured. Please sign in as Principal or Developer to set it up.
        </p>
      </div>
    );
  }

  if (isLoading) {
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
