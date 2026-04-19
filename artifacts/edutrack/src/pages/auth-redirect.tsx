import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function AuthRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const role = localStorage.getItem("edutrack_user_role");
    if (role === "admin" || role === "developer") {
      setLocation("/admin");
    } else if (role === "principal") {
      setLocation("/principal");
    } else if (role === "student") {
      setLocation("/student");
    } else if (role === "tutor" || role === "teacher") {
      setLocation("/tutor");
    } else if (role === "parent") {
      setLocation("/");
    } else {
      setLocation("/sign-in");
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}
