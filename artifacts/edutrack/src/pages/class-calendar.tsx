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
];

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
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Weekly sample matrix
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium sticky left-0 bg-muted/50">Class</th>
                  <th className="text-left px-3 py-2 font-medium">Type</th>
                  {DAYS.map(day => (
                    <th key={day} className="text-left px-3 py-2 font-medium">{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sample.map(row => (
                  <tr key={`${row.className}-${row.type}`} className="border-b last:border-0 align-top">
                    <td className="px-3 py-3 sticky left-0 bg-background font-medium min-w-[180px]">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                        {row.className}
                      </div>
                    </td>
                    <td className="px-3 py-3 min-w-[110px]">
                      <Badge variant="secondary">{row.type}</Badge>
                    </td>
                    {DAYS.map(day => {
                      const active = inDays(row, day);
                      return (
                        <td key={day} className="px-3 py-3 min-w-[170px] align-top">
                          {active ? (
                            <div className="space-y-2 rounded-lg border bg-card p-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {row.time}
                                </span>
                                <Badge variant="outline" className="text-[10px]">Live</Badge>
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <UserRound className="h-3 w-3" />
                                {row.teacher}
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
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

        <div className="grid gap-3 md:grid-cols-2">
          {sample.map(row => (
            <Card key={`${row.className}-${row.type}-summary`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>{row.className} · {row.type}</span>
                  <Badge variant="secondary">{row.students}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <UserRound className="h-4 w-4" />
                  {row.teacher}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {row.days.join(", ")} · {row.time}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
