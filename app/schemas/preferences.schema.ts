import { z } from 'zod';

export const REPORT_RANGE_OPTIONS = [
  'current_month',
  'current_year',
  'last_3_months',
  'last_6_months',
  'last_12_months',
  'all',
] as const;

export type ReportRange = typeof REPORT_RANGE_OPTIONS[number];

export const preferencesSchema = z.object({
  defaultReportRange: z.enum(REPORT_RANGE_OPTIONS),
});

export type PreferencesFormData = z.infer<typeof preferencesSchema>;
