import { ClerkProvider, useUser, useClerk } from "@clerk/react";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";

import Home from "@/pages/home";
import SignInPage from "@/pages/sign-in";
import AuthRedirect from "@/pages/auth-redirect";
import AdminPortal from "@/pages/admin";
import PrincipalDashboard from "@/pages/principal";
import NotFound from "@/pages/not-found";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;
if (!clerkPubKey) throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || "/" : path;
}

function ProtectedRoute({ component: Component, requiredRole }: { component: React.ComponentType; requiredRole?: string }) {
  const { isLoaded, isSignedIn } = useUser();
  const storedRole = localStorage.getItem("edutrack_user_role");

  if (!storedRole) return <Redirect to="/" />;
  if (requiredRole && storedRole !== requiredRole && storedRole !== "developer") return <Redirect to="/" />;
  if (!isLoaded) return null;
  if (!isSignedIn && !storedRole) return <Redirect to="/" />;
  return <Component />;
}

export function useSignOut() {
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  return () => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("edutrack_"))
      .forEach((k) => localStorage.removeItem(k));
    signOut().then(() => setLocation("/"));
  };
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
