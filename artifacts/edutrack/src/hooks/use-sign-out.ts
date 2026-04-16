import { useClerk } from "@clerk/react";
import { useLocation } from "wouter";

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
