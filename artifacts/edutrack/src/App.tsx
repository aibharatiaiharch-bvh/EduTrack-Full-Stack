import { lazy, Suspense } from "react";
import { ClerkProvider } from "@clerk/react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { apiUrl } from "@/lib/api";

import SignInPage from "@/pages/sign-in";
import AuthRedirect from "@/pages/auth-redirect";

const AdminPortal = lazy(() => import("@/pages/admin"));
const PrincipalDashboard = lazy(() => import("@/pages/principal"));
const StudentDashboard = lazy(() => import("@/pages/student"));
const TutorDashboard = lazy(() => import("@/pages/teacher-dashboard"));
const ClassCalendar = lazy(() => import("@/pages/class-calendar"));
const EnrollPage = lazy(() => import("@/pages/enroll"));
const NotFound = lazy(() => import("@/pages/not-found"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const HousekeepingPage = lazy(() => import("@/pages/housekeeping"));

async function ensureSheetId() {
  if (localStorage.getItem("edutrack_sheet_id")) return;
  try {
    const res = await fetch(apiUrl("/config"));
    const data = await res.json();
    if (data.sheetId) localStorage.setItem("edutrack_sheet_id", data.sheetId);
  } catch { /* silent */ }
}
ensureSheetId();

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
if (!clerkPubKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

function PageFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen text-sm text-muted-foreground">
      Loading…
    </div>
  );
}

function ProtectedRoute({ component: Component, requiredRole }: { component: React.ComponentType; requiredRole?: string }) {
  const storedRole = localStorage.getItem("edutrack_user_role");

  if (!storedRole) return <Redirect to="/" />;
  if (storedRole === "developer" || storedRole === "principal") return <Component />;
  if (requiredRole && storedRole !== requiredRole) return <Redirect to="/" />;
  return <Component />;
}

function AppRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<PageFallback />}>
          <Switch>
            <Route path="/" component={SignInPage} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/auth-redirect" component={AuthRedirect} />
            <Route path="/admin">
              <ProtectedRoute component={AdminPortal} />
            </Route>
            <Route path="/principal">
              <ProtectedRoute component={PrincipalDashboard} />
            </Route>
            <Route path="/student">
              <ProtectedRoute component={StudentDashboard} requiredRole="student" />
            </Route>
            <Route path="/tutor">
              <ProtectedRoute component={TutorDashboard} requiredRole="tutor" />
            </Route>
            <Route path="/settings">
              <ProtectedRoute component={SettingsPage} />
            </Route>
            <Route path="/housekeeping">
              <ProtectedRoute component={HousekeepingPage} />
            </Route>
            <Route path="/calendar" component={ClassCalendar} />
            <Route path="/enroll" component={EnrollPage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <AppRoutes />
      <Toaster />
    </WouterRouter>
  );
}
