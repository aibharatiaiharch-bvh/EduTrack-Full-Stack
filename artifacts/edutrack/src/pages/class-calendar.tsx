import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, Users, User, AlertTriangle, BookOpen } from "lucide-react";

const SHEET_KEY = "edutrack_sheet_id";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const _apiBase = ((import.meta.env.VITE_API_BASE_URL as string) || BASE).replace(/\/$/, "");
function apiUrl(path: string) { return `${_apiBase}/api${path}`; }

type Slot = {
  subjectId: string;
  className: string;
  type: string;
  teacherName: string;
  teacherEmail: string;
  room: string;
  time: string;
  maxCapacity: number;
  enrolled: number;
  isFull: boolean;
  students: string[];
};

type Day = {
  date: string;
  dateISO: string;
  dayName: string;
  slots: Slot[];
};

type CalendarData = { days: Day[]; weeks: number };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TYPE_ORDER = ["Individual", "Group", "Both"];

function dayKey(name: string) {
  return name.toLowerCase().slice(0, 3);
}

function dayLabel(dayName: string) {
  return `${dayName.slice(0, 3)} ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`;
}

function typeBadge(type: string) {
  return type === "Individual"
    ? <Badge variant="secondary" className="text-[10px]">Individual</Badge>
    : <Badge variant="secondary" className="text-[10px]">Group</Badge>;
}

function sectionTitle(day: Day) {
  return `${day.dayName} · ${day.date}`;
}

export default function ClassCalendar() {
  const sheetId = localStorage.getItem(SHEET_KEY);

  const { data, isLoading, error } = useQuery<CalendarData>({
    queryKey: ["class-calendar-matrix", sheetId],
    enabled: !!sheetId,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/schedule/calendar?sheetId=${encodeURIComponent(sheetId!)}&weeks=2`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const matrix = useMemo(() => {
    const days = data?.days ?? [];
    const grouped: Record<string, Slot[]> = {};
    for (const day of DAYS) grouped[day] = [];
    for (const day of days) {
      const key = dayKey(day.dayName);
      grouped[key] = [...(grouped[key] || []), ...day.slots];
    }
    return grouped;
  }, [data]);

  const rows = useMemo(() => {
    const all = Object.values(matrix).flat();
    const byClass = new Map<string, Slot>();
    for (const slot of all) {
      const key = `${slot.className}__${slot.type}`;
      if (!byClass.has(key)) byClass.set(key, slot);
    }
    return [...byClass.values()].sort((a, b) => {
      const ta = TYPE_ORDER.indexOf(a.type);
      const tb = TYPE_ORDER.indexOf(b.type);
      if (ta !== tb) return (ta === -1 ? 99 : ta) - (tb === -1 ? 99 : tb);
      return a.className.localeCompare(b.className);
    });
  }, [matrix]);

  const days = useMemo(() => {
    const map = new Map<string, Day>();
    for (const day of data?.days ?? []) map.set(day.dayName.slice(0, 3), day);
    return DAYS.map(d => map.get(d)).filter(Boolean) as Day[];
  }, [data]);

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 max-w-7xl">
        <header className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Class Calendar</h1>
          <p className="text-muted-foreground">Compact schedule matrix by weekday, subject, and class type.</p>
        </header>

        {!sheetId && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">No Google Sheet linked. Please go to Settings first.</p>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-[520px] w-full rounded-xl" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">Failed to load calendar. Please refresh.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Matrix view
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2 font-medium sticky left-0 bg-muted/50">Subject</th>
                      <th className="text-left px-3 py-2 font-medium">Type</th>
                      {DAYS.map(day => (
                        <th key={day} className="text-left px-3 py-2 font-medium">{day}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">No classes scheduled yet.</td>
                      </tr>
                    ) : rows.map((slot) => (
                      <tr key={`${slot.className}-${slot.type}`} className="border-b last:border-0 align-top">
                        <td className="px-3 py-3 sticky left-0 bg-background font-medium min-w-[220px]">
                          <div className="space-y-1">
                            <div>{slot.className}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <BookOpen className="h-3.5 w-3.5" />
                              {slot.teacherName || "Unassigned"}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 min-w-[100px]">{typeBadge(slot.type)}</td>
                        {DAYS.map(day => {
                          const daySlots = (data?.days ?? []).filter(d => d.dayName.slice(0, 3) === day).flatMap(d => d.slots);
                          const match = daySlots.find(s => s.className === slot.className && s.type === slot.type);
                          return (
                            <td key={day} className="px-3 py-3 min-w-[130px] align-top">
                              {match ? (
                                <div className="space-y-1 rounded-lg border bg-card p-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-medium flex items-center gap-1"><Clock className="h-3 w-3" />{match.time || "TBD"}</span>
                                    <Badge variant={match.isFull ? "destructive" : "secondary"} className="text-[10px]">{match.enrolled}/{match.maxCapacity}</Badge>
                                  </div>
                                  <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                                    <Users className="h-3 w-3" />{match.students.length} student{match.students.length === 1 ? "" : "s"}
                                  </div>
                                  {match.students.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {match.students.slice(0, 4).map((s, i) => (
                                        <span key={i} className="text-[10px] rounded bg-muted px-1.5 py-0.5">{s}</span>
                                      ))}
                                      {match.students.length > 4 && <span className="text-[10px] text-muted-foreground">+{match.students.length - 4}</span>}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
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

            <div className="grid gap-3 md:grid-cols-3">
              {(days.length ? days : []).map(day => (
                <Card key={day.dateISO}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>{sectionTitle(day)}</span>
                      <Badge variant="secondary">{day.slots.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {day.slots.slice(0, 3).map((slot, i) => (
                      <div key={`${slot.subjectId}-${i}`} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{slot.className}</div>
                          <div className="text-muted-foreground truncate">{slot.teacherName || "Unassigned"} · {slot.type}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-medium">{slot.time || "TBD"}</div>
                          <div className="text-muted-foreground">{slot.enrolled}/{slot.maxCapacity}</div>
                        </div>
                      </div>
                    ))}
                    {day.slots.length > 3 && <p className="text-xs text-muted-foreground">+{day.slots.length - 3} more</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
