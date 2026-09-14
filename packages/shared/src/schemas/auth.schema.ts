import { z } from "zod";
import { PROJECT_ROLES } from "../constants/roles";

export const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
    totpCode: z.string().length(6).optional(),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict();
export type RefreshInput = z.infer<typeof refreshSchema>;

export const inviteUserSchema = z
  .object({
    email: z.string().email(),
    companyId: z.string().uuid(),
    projectId: z.string().uuid(),
    role: z.enum(PROJECT_ROLES),
  })
  .strict();
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const acceptInviteSchema = z
  .object({
    inviteToken: z.string().min(1),
    name: z.string().min(1).max(200),
    password: z.string().min(12).max(200),
  })
  .strict();
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const enrollTotpSchema = z
  .object({
    totpCode: z.string().length(6),
  })
  .strict();
export type EnrollTotpInput = z.infer<typeof enrollTotpSchema>;

/** Self-service only (PATCH /auth/me) -- Procore's Directory shows a business and a mobile number per person. */
export const updateMyProfileSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    businessPhone: z.string().max(50).nullable().optional(),
    mobilePhone: z.string().max(50).nullable().optional(),
  })
  .strict();
export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;
