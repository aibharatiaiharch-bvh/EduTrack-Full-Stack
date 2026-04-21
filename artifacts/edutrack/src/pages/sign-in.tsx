import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GraduationCap, Loader2 } from "lucide-react";
import { apiUrl } from "@/lib/api";

export default function SignInPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.toLowerCase().trim();
    if (!trimmed) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(apiUrl(`/roles/check?email=${encodeURIComponent(trimmed)}`));
      const data = await res.json();

      if (!data.found || !data.role) {
        setError("This email is not registered in the system. Contact your principal to be added.");
        setLoading(false);
        return;
      }

      localStorage.setItem("edutrack_user_role", data.role);
      localStorage.setItem("edutrack_user_email", trimmed);
      if (data.name) localStorage.setItem("edutrack_user_name", data.name);
      if (data.userId) localStorage.setItem("edutrack_user_id", data.userId);
      if (data.sheetId) localStorage.setItem("edutrack_sheet_id", data.sheetId);

      // Unified landing: everyone goes to the dashboard (Calendar tab by default).
      // Dev/Admin still has access to /admin via the Dev Tools page.
      setLocation("/principal");
    } catch {
      setError("Could not reach the server. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center">
            <GraduationCap className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Sign in to EduTrack</h1>
          <p className="text-muted-foreground text-sm">Enter your registered email address</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            autoFocus
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || !email.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
