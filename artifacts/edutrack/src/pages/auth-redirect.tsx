import { useEffect, useState } from "react";
import { useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

const SHEET_KEY = "edutrack_sheet_id";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiUrl(path: string) {
  return `${BASE}/api${path}`;
}

export default function AuthRedirect() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState("Checking your account…");

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

    setStatus("Looking up your role…");

    fetch(apiUrl(`/roles/check?email=${encodeURIComponent(email)}&sheetId=${encodeURIComponent(sheetId)}`))
      .then((r) => r.json())
      .then((data) => {
        if (!data.found || !data.role) {
          setStatus("No role found. Redirecting to enrolment…");
          setTimeout(() => setLocation(`/enroll?sheetId=${encodeURIComponent(sheetId)}`), 800);
          return;
        }
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{status}</p>
    </div>
  );
}
