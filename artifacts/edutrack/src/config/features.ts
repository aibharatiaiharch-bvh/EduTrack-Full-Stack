const FEATURES_STORAGE_KEY = 'edutrack_features';

export const FEATURE_DEFAULTS = {
  schedule: true,
} as const;

export type FeatureKey = keyof typeof FEATURE_DEFAULTS;

export const FEATURE_META: Record<FeatureKey, { label: string; description: string }> = {
  schedule: { label: "Schedule", description: "Class scheduling, calendar view, and timetable management" },
};

export function getFeatures(): typeof FEATURE_DEFAULTS {
  try {
    const stored = localStorage.getItem(FEATURES_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...FEATURE_DEFAULTS, ...parsed };
    }
  } catch {}
  return { ...FEATURE_DEFAULTS };
}

export function setStoredFeatures(updates: Partial<typeof FEATURE_DEFAULTS>): void {
  try {
    const current = getFeatures();
    localStorage.setItem(FEATURES_STORAGE_KEY, JSON.stringify({ ...current, ...updates }));
  } catch {}
}

export const FEATURES = FEATURE_DEFAULTS;
