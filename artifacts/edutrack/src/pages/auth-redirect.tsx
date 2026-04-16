import { useEffect, useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { Loader2, ShieldCheck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";

type Screen = "loading" | "not-found" | "error";

export default function AuthRedirect() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const [screen, setScreen] = useState<Screen>("loading");

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !user) {
      setLocation("/sign-in");
      return;
    }

    const email = user.primaryEmailAddress?.emailAddress?.toLowerCase().trim() || "";
    if (!email) {
      setLocation("/sign-in");
      return;
    }

    fetch(apiUrl(`/roles/check?email=${encodeURIComponent(email)}`))
      .then((r) => r.json())
      .then((data) => {
        if (!data.found || !data.role) {
          setScreen("not-found");
          return;
        }

        localStorage.setItem("edutrack_user_role", data.role);
        localStorage.setItem("edutrack_user_email", email);
        if (data.name) localStorage.setItem("edutrack_user_name", data.name);
        if (data.userId) localStorage.setItem("edutrack_user_id", data.userId);

        const role: string = data.role;
        if (role === "developer" || role === "admin") {
          setLocation("/admin");
        } else if (role === "principal") {
          setLocation("/principal");
        } else {
          setLocation("/");
        }
      })
      .catch(() => setScreen("error"));
  }, [isLoaded, isSignedIn, user]);

  if (screen === "not-found") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground text-sm">
            Your email is not registered in this system. Contact your principal to be added.
          </p>
          <Button variant="outline" className="gap-2" onClick={() => signOut({ redirectUrl: "/" })}>
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  if (screen === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm text-center space-y-6">
          <h1 className="text-2xl font-bold">Connection Error</h1>
          <p className="text-muted-foreground text-sm">
            Could not reach the server. Please try again.
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => window.location.reload()}>Retry</Button>
            <Button variant="outline" onClick={() => signOut({ redirectUrl: "/" })}>
              Sign Out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}
