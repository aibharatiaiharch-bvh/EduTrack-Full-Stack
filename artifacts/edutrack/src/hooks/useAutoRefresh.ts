import { useEffect, useRef } from "react";

/**
 * Calls `fn` immediately on mount, then every `intervalMs` milliseconds.
 * Clears the interval on unmount. Skips polling when the tab is hidden.
 */
export function useAutoRefresh(fn: () => void, intervalMs = 30_000) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    fnRef.current();

    const id = setInterval(() => {
      if (!document.hidden) fnRef.current();
    }, intervalMs);

    return () => clearInterval(id);
  }, [intervalMs]);
}
