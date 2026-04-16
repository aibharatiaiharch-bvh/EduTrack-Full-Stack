import { useLocation } from "wouter";

export function useSignOut() {
  const [, setLocation] = useLocation();
  return () => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("edutrack_"))
      .forEach((k) => localStorage.removeItem(k));
    setLocation("/");
  };
}
