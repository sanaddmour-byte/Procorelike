import { z } from "zod";

export const createMeetingSchema = z
  .object({
    projectId: z.string().uuid(),
    title: z.string().min(1).max(300),
    occurredAt: z.string().datetime(),
    attendees: z.array(z.string().uuid()).max(100).default([]),
  })
  .strict();
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;

export const meetingItemStatusSchema = z.enum(["open", "closed", "converted"]);
export type MeetingItemStatus = z.infer<typeof meetingItemStatusSchema>;

export const createMeetingItemSchema = z
  .object({
    description: z.string().min(1).max(2000),
    ownerUserId: z.string().uuid().optional(),
  })
  .strict();
export type CreateMeetingItemInput = z.infer<typeof createMeetingItemSchema>;

export const transitionMeetingItemStatusSchema = z
  .object({
    toStatus: z.enum(["open", "closed"]),
  })
  .strict();
export type TransitionMeetingItemStatusInput = z.infer<typeof transitionMeetingItemStatusSchema>;

export const carryForwardMeetingItemSchema = z
  .object({
    toMeetingId: z.string().uuid(),
  })
  .strict();
export type CarryForwardMeetingItemInput = z.infer<typeof carryForwardMeetingItemSchema>;
