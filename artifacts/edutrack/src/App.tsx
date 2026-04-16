import { useEffect, useRef, useState } from "react";
import { ClerkProvider, SignUp, useClerk, useUser } from "@clerk/react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

// Pages
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import TeacherDashboard from "@/pages/teacher-dashboard";
import ClassCalendar from "@/pages/class-calendar";
import Settings from "@/pages/settings";
import ParentView from "@/pages/parent";
import PrincipalDashboard from "@/pages/principal";
import HousekeepingPage from "@/pages/housekeeping";
import AuthRedirect from "@/pages/auth-redirect";
import EnrollPage from "@/pages/enroll";
import AdminPortal from "@/pages/admin";
import BrowseClasses from "@/pages/browse-classes";
import StudentPortal from "@/pages/student";
import SignInPage from "@/pages/sign-in";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const _apiBase = ((import.meta.env.VITE_API_BASE_URL as string) || BASE).replace(/\/$/, "");

async function loadDefaultSheetId() {
  try {
    const res = await fetch(`${_apiBase}/api/config`);
    if (!res.ok) return;
    const { sheetId } = await res.json();
    if (sheetId && !localStorage.getItem("edutrack_sheet_id")) {
      localStorage.setItem("edutrack_sheet_id", sheetId);
    }
  } catch {
    // silently ignore — app still works if config fetch fails
  }
}

const sheetIdReadyPromise = localStorage.getItem("edutrack_sheet_id")
  ? Promise.resolve()
  : loadDefaultSheetId();

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

function SignUpPage() {
  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        forceRedirectUrl={`${basePath}/auth-redirect`}
      />
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: any }) {
  const { isLoaded, isSignedIn } = useUser();
  const [timedOut, setTimedOut] = useState(false);
  const hasStoredRole = !!localStorage.getItem("edutrack_user_role");

  useEffect(() => {
    if (isLoaded) return;
    const t = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(t);
  }, [isLoaded]);

  if (!isLoaded && !timedOut && !hasStoredRole) return null;
  if (!isSignedIn && !hasStoredRole) return <Redirect to="/" />;
  return <Component />;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  const [sheetReady, setSheetReady] = useState(!!localStorage.getItem("edutrack_sheet_id"));

  useEffect(() => {
    if (!sheetReady) {
      sheetIdReadyPromise.then(() => setSheetReady(true));
    }
  }, [sheetReady]);

  if (!sheetReady) return null;

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/auth-redirect" component={AuthRedirect} />
          <Route path="/enroll" component={EnrollPage} />

          <Route path="/dashboard">
            <ProtectedRoute component={TeacherDashboard} />
          </Route>
          <Route path="/classes">
            <ProtectedRoute component={BrowseClasses} />
          </Route>
          <Route path="/settings">
            <ProtectedRoute component={Settings} />
          </Route>
          <Route path="/student">
            <ProtectedRoute component={StudentPortal} />
          </Route>
          <Route path="/parent">
            <ProtectedRoute component={ParentView} />
          </Route>
          <Route path="/calendar">
            <ProtectedRoute component={ClassCalendar} />
          </Route>
          <Route path="/principal">
            <ProtectedRoute component={PrincipalDashboard} />
          </Route>
          <Route path="/housekeeping">
            <ProtectedRoute component={HousekeepingPage} />
          </Route>
          <Route path="/admin">
            <ProtectedRoute component={AdminPortal} />
          </Route>

          <Route component={NotFound} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
