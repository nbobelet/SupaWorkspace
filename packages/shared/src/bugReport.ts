import { z } from 'zod'

export const BugReportSeverity = z.enum(['low', 'medium', 'high', 'critical'])
export type BugReportSeverity = z.infer<typeof BugReportSeverity>

export const BugReportStatus = z.enum(['open', 'in-progress', 'fixed', 'wontfix'])
export type BugReportStatus = z.infer<typeof BugReportStatus>

export const BugReportCreateRequest = z.object({
  title: z.string().trim().min(1).max(200),
  severity: BugReportSeverity,
  description: z.string().trim().min(1).max(50_000),
  steps_to_reproduce: z.string().max(50_000).optional(),
  expected_behavior: z.string().max(50_000).optional(),
  actual_behavior: z.string().max(50_000).optional(),
})
export type BugReportCreateRequest = z.infer<typeof BugReportCreateRequest>

export const BugReportCreateResponse = z.object({
  id: z.string().uuid(),
  path: z.string(),
})
export type BugReportCreateResponse = z.infer<typeof BugReportCreateResponse>

export const BugReportSummary = z.object({
  id: z.string().uuid(),
  title: z.string(),
  severity: BugReportSeverity,
  status: BugReportStatus,
  created_at: z.string(),
  path: z.string(),
})
export type BugReportSummary = z.infer<typeof BugReportSummary>

export const BugReportListResponse = z.object({
  reports: z.array(BugReportSummary),
})
export type BugReportListResponse = z.infer<typeof BugReportListResponse>
