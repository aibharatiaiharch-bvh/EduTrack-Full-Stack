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
    className: "Science",
    type: "Group",
    teacher: "Mr. Ravi",
    students: 6,
    days: ["Mon", "Wed"],
    time: "5-6:30 PM",
    note: "Lab practice",
  },
  {
    className: "English",
    type: "Individual",
    teacher: "Ms. Anika",
    students: 1,
    days: ["Tue", "Thu"],
    time: "10-11 AM",
    note: "Reading + writing",
  },
  {
    className: "Hindi",
    type: "Group",
    teacher: "Ms. Nisha",
    students: 10,
    days: ["Sat"],
    time: "3:30-5 PM",
    note: "Weekend batch",
  },
];

const individualClasses = sample.filter(row => row.type === "Individual");
const groupClasses = sample.filter(row => row.type === "Group");

function statusForSeats(students: number, type: string) {
  if (type === "Individual") return { label: "Ind", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  if (students >= 10) return { label: "Grp", className: "bg-red-100 text-red-800 border-red-200" };
  if (students >= 6) return { label: "Grp", className: "bg-amber-100 text-amber-900 border-amber-200" };
  return { label: "Ind", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
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
          <p className="text-muted-foreground">Grouped by class type with compact sample schedules.</p>
        </header>

        {[["Group", groupClasses], ["Individual", individualClasses]].map(([label, rows]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4" />
                {label} classes
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
                {rows.map(row => (
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
                            <div className={`h-full min-h-[48px] rounded-md border px-2 py-1.5 ${seat.className}`}>
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[10px] font-semibold flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {row.time}
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px]">
                                <span className="truncate flex items-center gap-1 min-w-0">
                                  <UserRound className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{row.teacher}</span>
                                </span>
                                <span className="shrink-0 flex items-center gap-1">
                                  <Users className="h-3 w-3" />
                                  {row.students}/8
                                </span>
                              </div>
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
        ))}
        <div className="text-xs text-muted-foreground">
          Sheet mapping: Subjects tab uses <span className="font-medium">Name, Type, Teachers, Days, Time, Room, MaxCapacity</span>; enrollments tab supplies the live student count and is what drives red/yellow/green.
        </div>
      </div>
    </AppLayout>
  );
}
