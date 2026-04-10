/**
 * Feature flags — controlled by the developer via the Admin Portal.
 * Stored in Google Sheet Config tab and cached in localStorage.
 * Changes take effect on next page load.
 */

const FEATURES_STORAGE_KEY = 'edutrack_features';

export const FEATURE_DEFAULTS = {
  assessments: true,
  billing: true,
  schedule: true,
} as const;

export type FeatureKey = keyof typeof FEATURE_DEFAULTS;

export const FEATURE_META: Record<FeatureKey, { label: string; description: string }> = {
  assessments: { label: "Assessments", description: "Grade tracking, assessment reports, and student evaluations" },
  billing:     { label: "Billing",     description: "Invoices, payment tracking, and billing history" },
  schedule:    { label: "Schedule",    description: "Class scheduling, calendar view, and timetable management" },
};

/** Read current feature flags from localStorage (set by Admin Portal), fall back to defaults. */
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

/** Persist feature flags to localStorage. */
export function setStoredFeatures(updates: Partial<typeof FEATURE_DEFAULTS>): void {
  try {
    const current = getFeatures();
    localStorage.setItem(FEATURES_STORAGE_KEY, JSON.stringify({ ...current, ...updates }));
  } catch {}
}

/** Backward-compatible static export — use getFeatures() for dynamic access. */
export const FEATURES = FEATURE_DEFAULTS;
