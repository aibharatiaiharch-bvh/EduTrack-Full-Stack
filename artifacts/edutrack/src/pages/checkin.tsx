import { AppLayout } from "@/components/layout";
import { useListCheckins, getListCheckinsQueryKey, useUpdateCheckin } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

export default function Checkin() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const { data: checkins, isLoading } = useListCheckins({ date: today }, { query: { queryKey: getListCheckinsQueryKey({ date: today }) } });
  
  const updateCheckin = useUpdateCheckin();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleUpdateStatus = (id: number, status: string, timeField: string) => {
    const payload: any = { status };
    const now = format(new Date(), 'HH:mm:ss');
    if (timeField === 'checkinTime') payload.checkinTime = now;
    if (timeField === 'checkoutTime') payload.checkoutTime = now;

    updateCheckin.mutate({ id, data: payload }, {
      onSuccess: () => {
        toast({ title: "Status updated successfully" });
        queryClient.invalidateQueries({ queryKey: getListCheckinsQueryKey({ date: today }) });
      },
      onError: () => {
        toast({ title: "Failed to update status", variant: "destructive" });
      }
    });
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-8 space-y-6 md:space-y-8 max-w-5xl mx-auto w-full">
        <header className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Check-in / Out</h1>
            <p className="text-muted-foreground mt-1">Manage today's attendance: {format(new Date(), 'MMMM d, yyyy')}</p>
          </div>
        </header>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {checkins?.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
                No check-ins scheduled for today.
              </div>
            ) : checkins?.map(checkin => (
              <Card key={checkin.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col md:flex-row items-center justify-between p-6 gap-4">
                    <div className="flex items-center gap-4 flex-1">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                        checkin.status === 'pending' ? 'bg-amber-100 text-amber-600' :
                        checkin.status === 'checked-in' ? 'bg-blue-100 text-blue-600' :
                        checkin.status === 'checked-out' ? 'bg-green-100 text-green-600' :
                        'bg-red-100 text-red-600'
                      }`}>
                        {checkin.status === 'pending' && <Clock className="w-6 h-6" />}
                        {checkin.status === 'checked-in' && <CheckCircle2 className="w-6 h-6" />}
                        {checkin.status === 'checked-out' && <CheckCircle2 className="w-6 h-6" />}
                        {checkin.status === 'late-cancel' && <XCircle className="w-6 h-6" />}
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{checkin.studentName}</h3>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">{checkin.className}</span>
                          <span>•</span>
                          <span>{checkin.scheduledTime}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-2 shrink-0 w-full md:w-auto">
                      <Badge variant={
                        checkin.status === 'pending' ? 'outline' :
                        checkin.status === 'checked-in' ? 'default' :
                        checkin.status === 'checked-out' ? 'secondary' : 'destructive'
                      } className="mb-1 capitalize">
                        {checkin.status.replace('-', ' ')}
                      </Badge>
                      
                      <div className="flex flex-wrap justify-end gap-2 w-full md:w-auto">
                        {checkin.status === 'pending' && (
                          <>
                            <Button size="sm" onClick={() => handleUpdateStatus(checkin.id, 'checked-in', 'checkinTime')}>
                              Check In
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleUpdateStatus(checkin.id, 'late-cancel', '')}>
                              Late Cancel
                            </Button>
                          </>
                        )}
                        {checkin.status === 'checked-in' && (
                          <Button size="sm" variant="secondary" onClick={() => handleUpdateStatus(checkin.id, 'checked-out', 'checkoutTime')}>
                            Check Out
                          </Button>
                        )}
                        {(checkin.status === 'checked-out' || checkin.status === 'late-cancel') && (
                          <div className="text-xs text-muted-foreground flex flex-col items-end">
                            {checkin.checkinTime && <span>In: {checkin.checkinTime}</span>}
                            {checkin.checkoutTime && <span>Out: {checkin.checkoutTime}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
