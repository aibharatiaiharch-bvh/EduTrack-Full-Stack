import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock, Users, BookOpen, UserRound } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const sample = [
  {
    className: "Math",
    type: "Individual",
    teacher: "Ms. Priya",
    students: 1,
    days: ["Sat", "Sun"],
    time: "12:00 PM - 3:00 PM",
    note: "1:1 sessions",
  },
  {
    className: "Math",
    type: "Group",
    teacher: "Mr. Arjun",
    students: 8,
    days: ["Wed", "Fri"],
    time: "4:00 PM - 7:00 PM",
    note: "Batch class",
  },
  {
    className: "English",
    type: "Individual",
    teacher: "Ms. Anika",
    students: 1,
    days: ["Tue", "Thu"],
    time: "10:00 AM - 11:00 AM",
    note: "Reading + writing",
  },
  {
    className: "Science",
    type: "Group",
    teacher: "Mr. Ravi",
    students: 6,
    days: ["Mon", "Wed"],
    time: "5:00 PM - 6:30 PM",
    note: "Lab practice",
  },
  {
    className: "Hindi",
    type: "Group",
    teacher: "Ms. Nisha",
    students: 10,
    days: ["Sat"],
    time: "3:30 PM - 5:00 PM",
    note: "Weekend batch",
  },
];

function statusForSeats(students: number, type: string) {
  if (type === "Individual") return { label: "Green", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (students >= 10) return { label: "Red", className: "bg-red-50 text-red-700 border-red-200" };
  if (students >= 6) return { label: "Yellow", className: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: "Green", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

function inDays(row: (typeof sample)[number], day: string) {
  return row.days.includes(day);
}

export default function ClassCalendar() {
  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 max-w-7xl">
        <header className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Class Calendar</h1>
          <p className="text-muted-foreground">Example matrix by weekday with teacher and student count.</p>
        </header>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Weekly sample matrix
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-xs border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-2 py-1.5 font-medium sticky left-0 bg-muted/50">Class</th>
                  <th className="text-left px-2 py-1.5 font-medium">Type</th>
                  {DAYS.map(day => (
                    <th key={day} className="text-left px-2 py-1.5 font-medium">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sample.map(row => (
                  <tr key={`${row.className}-${row.type}`} className="border-b last:border-0 align-top">
                    <td className="px-2 py-2 sticky left-0 bg-background font-medium min-w-[150px]">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                        {row.className}
                      </div>
                    </td>
                    <td className="px-2 py-2 min-w-[90px]">
                      <Badge variant="secondary" className="text-[10px]">{row.type}</Badge>
                    </td>
                    {DAYS.map(day => {
                      const active = inDays(row, day);
                      const seat = statusForSeats(row.students, row.type);
                      return (
                        <td key={day} className="px-2 py-2 min-w-[125px] align-top">
                          {active ? (
                            <div className="space-y-1.5 rounded-md border bg-card p-2">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[11px] font-medium flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {row.time}
                                </span>
                                <Badge variant="outline" className={`text-[10px] ${seat.className}`}>{seat.label}</Badge>
                              </div>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <UserRound className="h-3 w-3" />
                                {row.teacher}
                              </div>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {row.students} student{row.students === 1 ? "" : "s"}
                              </div>
                              <div className="text-[11px] text-muted-foreground">{row.note}</div>
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

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {sample.map(row => (
            <Card key={`${row.className}-${row.type}-summary`}>
              <CardHeader className="pb-1.5 pt-3">
                <CardTitle className="text-xs flex items-center justify-between">
                  <span>{row.className} · {row.type}</span>
                  <Badge variant="secondary" className="text-[10px]">{row.students}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs pt-0 pb-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <UserRound className="h-3.5 w-3.5" />
                  {row.teacher}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {row.days.join(", ")} · {row.time}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[10px] ${statusForSeats(row.students, row.type).className}`}>
                    {statusForSeats(row.students, row.type).label}
                  </Badge>
                  <span className="text-muted-foreground">seat status</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          Sheet mapping: Subjects tab uses <span className="font-medium">Name, Type, Teachers, Days, Time, Room, MaxCapacity</span>; enrollments tab supplies the live student count and is what drives red/yellow/green.
        </div>
      </div>
    </AppLayout>
  );
}
