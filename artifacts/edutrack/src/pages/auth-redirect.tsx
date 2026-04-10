import { useEffect, useState } from "react";
import { useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { Loader2, Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClerk } from "@clerk/react";

const SHEET_KEY = "edutrack_sheet_id";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiUrl(path: string) {
  return `${BASE}/api${path}`;
}

function PendingApproval({ name }: { name: string }) {
  const { signOut } = useClerk();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
          <Clock className="w-8 h-8 text-amber-500" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Pending Approval</h1>
        <p className="text-muted-foreground">
          Hi{name ? ` ${name}` : ""}! Your enrolment request has been received.
          A staff member or principal will review and activate your account shortly.
        </p>
        <p className="text-sm text-muted-foreground">
          Once activated you'll be able to sign in and access the Parent Portal, view class schedules, and manage your enrolments.
        </p>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => signOut({ redirectUrl: "/" })}
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>
      </div>
    </div>
  );
}

export default function AuthRedirect() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState("Checking your account…");
  const [pendingName, setPendingName] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !user) {
      setLocation("/");
      return;
    }

    const email = user.primaryEmailAddress?.emailAddress || "";
    const sheetId = localStorage.getItem(SHEET_KEY);

    if (!sheetId) {
      setStatus("No school linked. Redirecting to Settings…");
      setTimeout(() => setLocation("/settings"), 1500);
      return;
    }

    setStatus("Looking up your account…");

    fetch(apiUrl(`/roles/check?email=${encodeURIComponent(email)}&sheetId=${encodeURIComponent(sheetId)}`))
      .then((r) => r.json())
      .then((data) => {
        // Not found at all — send to enrolment form
        if (!data.found || !data.role) {
          setStatus("No account found. Redirecting to enrolment form…");
          setTimeout(() => setLocation(`/enroll?sheetId=${encodeURIComponent(sheetId)}`), 800);
          return;
        }

        // Found but pending approval
        if (data.status === 'pending') {
          setPendingName(data.name || "");
          return;
        }

        // Active — route by role
        const role: string = data.role;
        if (role === "principal") {
          setStatus("Welcome, Principal. Redirecting…");
          setTimeout(() => setLocation("/principal"), 600);
        } else if (role === "tutor") {
          setStatus("Welcome back. Redirecting to your dashboard…");
          setTimeout(() => setLocation("/dashboard"), 600);
        } else if (role === "parent") {
          setStatus("Welcome. Redirecting to the Parent Portal…");
          setTimeout(() => setLocation("/parent"), 600);
        } else {
          setStatus("Unknown role. Redirecting to home…");
          setTimeout(() => setLocation("/"), 800);
        }
      })
      .catch(() => {
        setStatus("Could not reach the server. Redirecting to dashboard…");
        setTimeout(() => setLocation("/dashboard"), 1500);
      });
  }, [isLoaded, isSignedIn, user, setLocation]);

  if (pendingName !== null) {
    return <PendingApproval name={pendingName} />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{status}</p>
    </div>
  );
}
