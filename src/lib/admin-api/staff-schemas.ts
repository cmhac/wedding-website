import { z } from "zod";

/**
 * Schemas for the staff-access endpoints (couple only), see
 * specs/001-guest-data-model/contracts/admin-api.md. Kept apart from
 * schemas.ts so the staff stage stands alone.
 */

export const grantStaffRequestSchema = z.object({
  email: z.email().max(320),
  display_name: z.string().trim().min(1).max(200),
});
export type GrantStaffRequest = z.infer<typeof grantStaffRequestSchema>;

export const staffMemberSchema = z.object({
  user_id: z.uuid(),
  role: z.enum(["couple", "planner"]),
  display_name: z.string(),
});
export type StaffMember = z.infer<typeof staffMemberSchema>;

export const grantStaffResponseSchema = z.object({ staff: staffMemberSchema });
export type GrantStaffResponse = z.infer<typeof grantStaffResponseSchema>;

export const staffUserIdSchema = z.uuid();
