/**
 * Feature flags — controlled by the developer.
 *
 * Set a feature to `false` to hide it from the sidebar and mark it as
 * unavailable. Flip it to `true` when you're ready to include it in the
 * plan/upgrade tier offered to this customer.
 *
 * Changes here take effect on the next page load (no restart needed in dev).
 */
export const FEATURES = {
  /** Grade tracking, assessment reports, and student evaluations. */
  assessments: true,

  /** Invoices, payment tracking, and billing history. */
  billing: true,

  /** Class scheduling and calendar view. */
  schedule: true,
} as const;

export type FeatureKey = keyof typeof FEATURES;
