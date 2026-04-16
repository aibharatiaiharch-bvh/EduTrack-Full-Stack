import { useSignOut } from "@/hooks/use-sign-out";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, LogOut, Users, Shield } from "lucide-react";

export default function AdminPortal() {
  const signOut = useSignOut();
  const name = localStorage.getItem("edutrack_user_name") || "Developer";
  const email = localStorage.getItem("edutrack_user_email") || "";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">EduTrack</span>
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Admin</span>
        </div>
        <Button variant="ghost" size="sm" className="gap-2" onClick={signOut}>
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Welcome, {name}</h1>
          <p className="text-muted-foreground text-sm mt-1">{email}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Manage tutors, principals, students and parents registered in the system.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                System
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Configure Google Sheet, manage roles and review system health.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
