import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "edutrack_feature_flags";
const CHANGE_EVENT = "edutrack-features-changed";

export type FeatureFlags = {
  assessments: boolean;
  billing: boolean;
};

const DEFAULTS: FeatureFlags = {
  assessments: true,
  billing: true,
};

function readFlags(): FeatureFlags {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function useFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlags>(readFlags);

  useEffect(() => {
    const onchange = () => setFlags(readFlags());
    window.addEventListener(CHANGE_EVENT, onchange);
    return () => window.removeEventListener(CHANGE_EVENT, onchange);
  }, []);

  const setFlag = useCallback((key: keyof FeatureFlags, value: boolean) => {
    const next = { ...readFlags(), [key]: value };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { flags, setFlag };
}
