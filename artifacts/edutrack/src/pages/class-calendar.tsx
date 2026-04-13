import { useState, useMemo } from "react";
import { useUser } from "@clerk/react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar, Clock, Users, User, BookOpen, AlertTriangle,
  CheckCircle2, ChevronRight, Video,
} from "lucide-react";

const SHEET_KEY = "edutrack_sheet_id";
const ROLE_KEY = "edutrack_user_role";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiUrl(path: string) { return `${BASE}/api${path}`; }

type CalendarSlot = {
  subjectId: string;
  className: string;
  type: string;
  teacherName: string;
  teacherEmail: string;
  zoomLink: string;
  room: string;
  time: string;
  maxCapacity: number;
  enrolled: number;
  isFull: boolean;
  students: string[];
};

type CalendarDay = {
  date: string;
  dateISO: string;
  dayName: string;
  slots: CalendarSlot[];
};

type CalendarData = {
  days: CalendarDay[];
  weeks: number;
};

function capacityColor(enrolled: number, max: number) {
  const pct = enrolled / max;
  if (pct >= 1) return "text-destructive";
  if (pct >= 0.75) return "text-amber-600";
  return "text-green-600";
}

function typeIcon(type: string) {
  return type === "Individual"
    ? <User className="h-3.5 w-3.5" />
    : <Users className="h-3.5 w-3.5" />;
}

export default function ClassCalendar() {
  const { user } = useUser();
  const sheetId = localStorage.getItem(SHEET_KEY);
  const role = localStorage.getItem(ROLE_KEY) || "parent";
  const { toast } = useToast();
  const qc = useQueryClient();

  const [bookingSlot, setBookingSlot] = useState<{ slot: CalendarSlot; date: string } | null>(null);
  const [studentName, setStudentName] = useState("");
  const [parentEmail, setParentEmail] = useState(user?.primaryEmailAddress?.emailAddress || "");
  const [selectedWeek, setSelectedWeek] = useState<0 | 1>(0);

  const { data, isLoading, error } = useQuery<CalendarData>({
    queryKey: ["class-calendar", sheetId],
    enabled: !!sheetId,
    queryFn: async () => {
      const res = await fetch(apiUrl(`/schedule/calendar?sheetId=${encodeURIComponent(sheetId!)}&weeks=2`));
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!bookingSlot) return;
      const res = await fetch(apiUrl("/enrollments/join"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId,
          studentName: studentName.trim(),
          parentEmail: parentEmail.trim(),
          subjectName: bookingSlot.slot.className,
          subjectType: bookingSlot.slot.type,
          teacherName: bookingSlot.slot.teacherName,
          teacherEmail: bookingSlot.slot.teacherEmail,
          zoomLink: bookingSlot.slot.zoomLink,
          classDate: bookingSlot.date,
          classTime: bookingSlot.slot.time,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["class-calendar"] });
      toast({ title: "Booking confirmed!", description: `${studentName} has been enrolled in ${bookingSlot?.slot.className}.` });
      setBookingSlot(null);
      setStudentName("");
    },
    onError: (err: any) => {
      toast({ title: "Booking failed", description: err.message, variant: "destructive" });
    },
  });

  const allDays = data?.days ?? [];

  // Group days into two weeks
  const week1 = useMemo(() => allDays.filter((_, i) => i < 7), [allDays]);
  const week2 = useMemo(() => allDays.filter((_, i) => i >= 7), [allDays]);

  const currentWeekDays = selectedWeek === 0 ? week1 : week2;

  const weekLabel = (days: CalendarDay[]) => {
    if (!days.length) return "";
    return `${days[0].date} – ${days[days.length - 1].date}`;
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 max-w-5xl">
        <header className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Class Calendar</h1>
          <p className="text-muted-foreground">View available classes for the next 2 weeks and book a spot.</p>
        </header>

        {!sheetId && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">No Google Sheet linked. Please go to Settings first.</p>
          </div>
        )}

        {/* Week tabs */}
        <div className="flex gap-2 border-b border-border pb-0">
          {[
            { idx: 0, label: "This week", sublabel: weekLabel(week1) },
            { idx: 1, label: "Next week", sublabel: weekLabel(week2) },
          ].map(({ idx, label, sublabel }) => (
            <button
              key={idx}
              onClick={() => setSelectedWeek(idx as 0 | 1)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                selectedWeek === idx
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {sublabel && <span className="ml-1.5 text-xs font-normal hidden sm:inline">({sublabel})</span>}
            </button>
          ))}
        </div>

        {/* Calendar content */}
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">Failed to load calendar. Please refresh.</p>
          </div>
        ) : currentWeekDays.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed rounded-xl text-muted-foreground flex flex-col items-center gap-3">
            <Calendar className="h-10 w-10 opacity-30" />
            <p className="font-medium">No classes scheduled this week</p>
            <p className="text-sm">Check back or try the other week tab.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {currentWeekDays.map((day) => (
              <div key={day.dateISO} className="space-y-3">
                {/* Day header */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex flex-col items-center justify-center shrink-0">
                    <span className="text-xs font-medium text-primary leading-none">{day.dayName.slice(0, 3)}</span>
                    <span className="text-base font-bold text-primary leading-none mt-0.5">
                      {day.date.split("/")[0]}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{day.dayName}</p>
                    <p className="text-xs text-muted-foreground">{day.date}</p>
                  </div>
                  <Badge variant="secondary" className="ml-auto">{day.slots.length} {day.slots.length === 1 ? "class" : "classes"}</Badge>
                </div>

                {/* Slots */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {day.slots.map((slot, i) => (
                    <Card
                      key={`${slot.subjectId}-${i}`}
                      className={`overflow-hidden transition-shadow hover:shadow-md ${slot.isFull ? "opacity-70" : ""}`}
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm leading-tight">{slot.className}</p>
                            {slot.teacherName && (
                              <p className="text-xs text-muted-foreground mt-0.5">{slot.teacherName}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                            {typeIcon(slot.type)}
                            <span className="text-xs">{slot.type}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {slot.time && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />{slot.time}
                            </span>
                          )}
                          {slot.room && (
                            <span className="flex items-center gap-1">
                              <BookOpen className="h-3 w-3" />{slot.room}
                            </span>
                          )}
                          {slot.zoomLink && (
                            <a href={slot.zoomLink} target="_blank" rel="noreferrer"
                              className="flex items-center gap-1 text-primary hover:underline">
                              <Video className="h-3 w-3" />Zoom
                            </a>
                          )}
                        </div>

                        {/* Capacity bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className={`font-medium ${capacityColor(slot.enrolled, slot.maxCapacity)}`}>
                              {slot.enrolled}/{slot.maxCapacity} enrolled
                            </span>
                            {slot.isFull && <Badge variant="destructive" className="text-xs py-0 px-1.5">Full</Badge>}
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                slot.isFull ? "bg-destructive" :
                                slot.enrolled / slot.maxCapacity >= 0.75 ? "bg-amber-500" : "bg-green-500"
                              }`}
                              style={{ width: `${Math.min((slot.enrolled / slot.maxCapacity) * 100, 100)}%` }}
                            />
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant={slot.isFull ? "outline" : "default"}
                          className="w-full gap-1.5"
                          disabled={slot.isFull}
                          onClick={() => {
                            setBookingSlot({ slot, date: day.date });
                            setStudentName("");
                            setParentEmail(user?.primaryEmailAddress?.emailAddress || "");
                          }}
                        >
                          {slot.isFull ? (
                            "Class Full"
                          ) : (
                            <>
                              Book a Spot
                              <ChevronRight className="h-3.5 w-3.5" />
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Booking dialog */}
      <Dialog open={!!bookingSlot} onOpenChange={(open) => { if (!open) setBookingSlot(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Book a Spot</DialogTitle>
          </DialogHeader>
          {bookingSlot && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                <p className="font-semibold text-sm">{bookingSlot.slot.className}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{bookingSlot.date}</span>
                  {bookingSlot.slot.time && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{bookingSlot.slot.time}</span>}
                  {bookingSlot.slot.teacherName && <span>{bookingSlot.slot.teacherName}</span>}
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  <span className="text-green-700 font-medium">
                    {bookingSlot.slot.maxCapacity - bookingSlot.slot.enrolled} {bookingSlot.slot.maxCapacity - bookingSlot.slot.enrolled === 1 ? "spot" : "spots"} remaining
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="book-student">Student Name *</Label>
                  <Input
                    id="book-student"
                    placeholder="Enter student's full name"
                    value={studentName}
                    onChange={e => setStudentName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="book-parent">Parent / Guardian Email *</Label>
                  <Input
                    id="book-parent"
                    type="email"
                    placeholder="parent@example.com"
                    value={parentEmail}
                    onChange={e => setParentEmail(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingSlot(null)}>Cancel</Button>
            <Button
              disabled={!studentName.trim() || !parentEmail.trim() || bookMutation.isPending}
              onClick={() => bookMutation.mutate()}
            >
              {bookMutation.isPending ? "Booking…" : "Confirm Booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
