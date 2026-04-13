import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from "@clerk/react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// Pages
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import TeacherDashboard from "@/pages/teacher-dashboard";
import Settings from "@/pages/settings";
import Checkin from "@/pages/checkin";
import ParentView from "@/pages/parent";
import PrincipalDashboard from "@/pages/principal";
import AuthRedirect from "@/pages/auth-redirect";
import EnrollPage from "@/pages/enroll";
import AdminPortal from "@/pages/admin";
import MySchedule from "@/pages/my-schedule";
import BrowseClasses from "@/pages/browse-classes";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

function SignInPage() {
  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-50">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/auth-redirect`} />
    </div>
  );
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

function HomeRedirect() {
  return <Home />;
}

function ProtectedRoute({ component: Component }: { component: any }) {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect to="/" />;
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
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/auth-redirect" component={AuthRedirect} />
          <Route path="/enroll" component={EnrollPage} />
          
          <Route path="/dashboard">
            <ProtectedRoute component={TeacherDashboard} />
          </Route>
          <Route path="/checkin">
            <ProtectedRoute component={Checkin} />
          </Route>
          <Route path="/schedule">
            <ProtectedRoute component={MySchedule} />
          </Route>
          <Route path="/classes">
            <ProtectedRoute component={BrowseClasses} />
          </Route>
          <Route path="/assessments">
            <ProtectedRoute component={Dashboard} />
          </Route>
          <Route path="/teachers">
            <ProtectedRoute component={Dashboard} />
          </Route>
          <Route path="/billing">
            <ProtectedRoute component={Dashboard} />
          </Route>
          <Route path="/settings">
            <ProtectedRoute component={Settings} />
          </Route>
          <Route path="/parent" component={ParentView} />
          <Route path="/principal">
            <ProtectedRoute component={PrincipalDashboard} />
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
