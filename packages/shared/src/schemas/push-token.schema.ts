import { z } from "zod";

export const PUSH_PLATFORMS = ["ios", "android"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/** Registers (or re-registers, via upsert on the token's own uniqueness) the caller's device for push delivery. */
export const registerPushTokenSchema = z
  .object({
    token: z.string().min(1).max(300),
    platform: z.enum(PUSH_PLATFORMS),
  })
  .strict();
export type RegisterPushTokenInput = z.infer<typeof registerPushTokenSchema>;

export const unregisterPushTokenSchema = z.object({ token: z.string().min(1).max(300) }).strict();
export type UnregisterPushTokenInput = z.infer<typeof unregisterPushTokenSchema>;
