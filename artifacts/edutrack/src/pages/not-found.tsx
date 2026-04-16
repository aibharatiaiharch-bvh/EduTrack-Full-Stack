import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Page not found.</p>
      <Button onClick={() => setLocation("/")}>Go Home</Button>
    </div>
  );
}
