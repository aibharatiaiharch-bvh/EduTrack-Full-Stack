import { ClerkProvider } from "@clerk/react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { apiUrl } from "@/lib/api";

import Home from "@/pages/home";
import SignInPage from "@/pages/sign-in";
import AuthRedirect from "@/pages/auth-redirect";
import AdminPortal from "@/pages/admin";
import PrincipalDashboard from "@/pages/principal";
import StudentDashboard from "@/pages/student";
import TutorDashboard from "@/pages/teacher-dashboard";
import ClassCalendar from "@/pages/class-calendar";
import EnrollPage from "@/pages/enroll";
import NotFound from "@/pages/not-found";

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

function ProtectedRoute({ component: Component, requiredRole }: { component: React.ComponentType; requiredRole?: string }) {
  const storedRole = localStorage.getItem("edutrack_user_role");

  if (!storedRole) return <Redirect to="/" />;
  if (requiredRole && storedRole !== requiredRole && storedRole !== "developer") return <Redirect to="/" />;
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
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/auth-redirect" component={AuthRedirect} />
          <Route path="/admin">
            <ProtectedRoute component={AdminPortal} />
          </Route>
          <Route path="/principal">
            <ProtectedRoute component={PrincipalDashboard} requiredRole="principal" />
          </Route>
          <Route path="/student">
            <ProtectedRoute component={StudentDashboard} requiredRole="student" />
          </Route>
          <Route path="/tutor">
            <ProtectedRoute component={TutorDashboard} requiredRole="tutor" />
          </Route>
          <Route path="/calendar" component={ClassCalendar} />
          <Route path="/enroll" component={EnrollPage} />
          <Route component={NotFound} />
        </Switch>
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
