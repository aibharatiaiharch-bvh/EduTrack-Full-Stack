import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { GraduationCap } from "lucide-react";

export default function Home() {
  const [, setLocation] = useLocation();
  const storedRole = (localStorage.getItem("edutrack_user_role") || "").toLowerCase();

  function goToPortal() {
    if (storedRole === "developer" || storedRole === "admin") {
      setLocation("/admin");
    } else if (storedRole === "principal" || storedRole === "staff") {
      setLocation("/principal");
    } else if (storedRole === "student") {
      setLocation("/student");
    } else if (storedRole === "tutor") {
      setLocation("/tutor");
    } else {
      setLocation("/sign-in");
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm text-center space-y-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center">
            <GraduationCap className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">EduTrack</h1>
          <p className="text-muted-foreground text-sm">
            Tutor &amp; coaching management platform
          </p>
        </div>
        <Button className="w-full" size="lg" onClick={goToPortal}>
          {storedRole ? "Go to Portal" : "Sign In"}
        </Button>
      </div>
    </div>
  );
}
